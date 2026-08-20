import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionGuard } from '../../src/modules/demo/presentation/demo-session.guard';
import { HandoffDraftsService } from '../../src/modules/handoffs/application/handoff-drafts.service';
import { HandoffDraftsController } from '../../src/modules/handoffs/presentation/handoff-drafts.controller';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const RECEIVER_ID = '00000000-0000-4000-8000-000000000202';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const PRECHECK_ID = '00000000-0000-4000-8000-000000000501';
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const JOB_ID = '00000000-0000-4000-8000-000000000701';
const EVENT_ID = '00000000-0000-4000-8000-000000000801';
const NOW = new Date('2026-08-18T02:00:00.000Z');
const SESSION_ID = 'handoff-draft-session';

describe('Handoff draft public API (e2e)', () => {
  let app: INestApplication;
  const service = createService();

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [HandoffDraftsController],
      providers: [
        { provide: HandoffDraftsService, useValue: service },
        DemoSessionGuard,
        { provide: APP_GUARD, useExisting: DemoSessionGuard },
        {
          provide: DemoSessionContextResolver,
          useValue: {
            resolve: jest.fn().mockResolvedValue({
              datasetId: DATASET_ID,
              actorId: ACTOR_ID,
              wardId: WARD_ID,
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(true) },
        },
        Reflector,
      ],
    }).compile();
    app = fixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('POST /handoffs는 202 GENERATING receipt를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/handoffs')
      .set('X-Demo-Session-Id', SESSION_ID)
      .set('X-Idempotency-Key', 'generate-key')
      .send({
        precheckId: PRECHECK_ID,
        templateId: 'NURSING_HANDOFF_V1',
        includeUnverified: false,
      })
      .expect(202);
    expect(response.body.data).toEqual({
      handoffId: HANDOFF_ID,
      status: 'GENERATING',
    });
  });

  it('GET /handoffs는 meta.page cursor와 GENERATING 없는 projection을 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/handoffs')
      .set('X-Demo-Session-Id', SESSION_ID)
      .query({ date: '2026-08-18', status: 'DRAFT', limit: 20 })
      .expect(200);
    expect(response.body).toEqual({
      data: {
        items: [
          {
            handoffId: HANDOFF_ID,
            status: 'DRAFT',
            patientCount: 1,
            taskCount: 0,
            updatedAt: NOW.toISOString(),
          },
        ],
      },
      meta: {
        requestId: expect.any(String),
        page: { nextCursor: 'opaque-next-cursor' },
      },
    });
  });

  it('GET /handoffs/{id}는 FAILED job을 부분 draft 없이 관측한다', async () => {
    service.get.mockResolvedValueOnce(generatingFailedDetail());
    const response = await request(app.getHttpServer())
      .get(`/api/v1/handoffs/${HANDOFF_ID}`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .expect(200);
    expect(response.body.data).toMatchObject({
      handoffId: HANDOFF_ID,
      status: 'GENERATING',
      generationJob: {
        jobId: JOB_ID,
        status: 'FAILED',
        failureCode: 'HANDOFF_AI_TIMEOUT',
        retryable: true,
      },
    });
    expect(response.body.data).not.toHaveProperty('patients');
  });

  it('GET DRAFT는 7 section과 SUMMARY excerpt citation을 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/handoffs/${HANDOFF_ID}`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .expect(200);
    expect(response.body.data.patients[0]).toMatchObject({
      sections: {
        vitalSigns: 'VITAL_SIGNS 현재본',
        respiration: 'RESPIRATION 현재본',
        mentalStatus: 'MENTAL_STATUS 현재본',
        pain: 'PAIN 현재본',
        treatment: 'TREATMENT 현재본',
        diet: 'DIET 현재본',
        observation: 'OBSERVATION 현재본',
      },
      citations: [
        expect.objectContaining({
          sourceType: 'TIMELINE_EVENT',
          sourceId: EVENT_ID,
          sourceReference: 'timeline:event:801',
          occurredAt: NOW.toISOString(),
          excerptKind: 'SUMMARY',
          excerpt: '체온 상승 관찰',
          section: 'VITAL_SIGNS',
        }),
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain('audio');
    expect(JSON.stringify(response.body)).not.toContain('UTTERANCE');
  });

  it('PATCH /handoffs/{id}는 version 조건 수정 결과를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/handoffs/${HANDOFF_ID}`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .send({
        patients: [
          {
            patientId: PATIENT_ID,
            sections: {
              vitalSigns: '활력징후',
              respiration: '호흡',
              mentalStatus: '의식상태',
              pain: '통증',
              treatment: '치료',
              diet: '식이',
              observation: '관찰',
            },
          },
        ],
        taskIds: [],
        version: 1,
      })
      .expect(200);
    expect(response.body.data).toEqual({
      handoffId: HANDOFF_ID,
      status: 'DRAFT',
      version: 2,
      updatedAt: NOW.toISOString(),
    });
  });

  it('존재하지 않는 날짜와 Stage6 status는 400으로 거부한다', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/handoffs')
      .set('X-Demo-Session-Id', SESSION_ID)
      .query({ date: '2026-02-30' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/handoffs')
      .set('X-Demo-Session-Id', SESSION_ID)
      .query({ status: 'ACKNOWLEDGED' })
      .expect(400);
  });
});

function createService() {
  return {
    create: jest.fn().mockResolvedValue({
      handoffId: HANDOFF_ID,
      status: 'GENERATING',
    }),
    list: jest.fn().mockResolvedValue({
      items: [
        {
          handoffId: HANDOFF_ID,
          status: 'DRAFT',
          patientCount: 1,
          taskCount: 0,
          updatedAt: NOW,
        },
      ],
      nextCursor: 'opaque-next-cursor',
    }),
    get: jest.fn().mockResolvedValue(draftDetail()),
    update: jest.fn().mockResolvedValue({
      handoffId: HANDOFF_ID,
      status: 'DRAFT',
      version: 2,
      updatedAt: NOW,
    }),
  };
}

function draftDetail() {
  const sections = [
    'VITAL_SIGNS',
    'RESPIRATION',
    'MENTAL_STATUS',
    'PAIN',
    'TREATMENT',
    'DIET',
    'OBSERVATION',
  ].map((section) => ({
    section,
    aiOriginalContent: `${section} 원문`,
    currentContent: `${section} 현재본`,
    isModified: true,
    citations:
      section === 'VITAL_SIGNS'
        ? [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: EVENT_ID,
              sourceReference: 'timeline:event:801',
              occurredAt: NOW,
              excerptKind: 'SUMMARY',
              excerpt: '체온 상승 관찰',
            },
          ]
        : [],
  }));
  return {
    handoffId: HANDOFF_ID,
    status: 'DRAFT',
    version: 2,
    date: '2026-08-18',
    senderActorId: ACTOR_ID,
    receiverActorId: RECEIVER_ID,
    generationJob: {
      jobId: JOB_ID,
      status: 'SUCCEEDED',
      failureCode: null,
      retryable: null,
    },
    draft: {
      templateId: 'NURSING_HANDOFF_V1',
      includeUnverified: false,
      patients: [{ patientId: PATIENT_ID, sections }],
      tasks: [],
      warnings: [],
    },
    updatedAt: NOW,
  };
}

function generatingFailedDetail() {
  return {
    handoffId: HANDOFF_ID,
    status: 'GENERATING',
    version: 1,
    date: '2026-08-18',
    senderActorId: ACTOR_ID,
    receiverActorId: RECEIVER_ID,
    generationJob: {
      jobId: JOB_ID,
      status: 'FAILED',
      failureCode: 'HANDOFF_AI_TIMEOUT',
      retryable: true,
    },
    draft: null,
    updatedAt: NOW,
  };
}
