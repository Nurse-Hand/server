import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionGuard } from '../../src/modules/demo/presentation/demo-session.guard';
import { HandoffPrechecksService } from '../../src/modules/handoffs/application/handoff-prechecks.service';
import { HandoffPrechecksController } from '../../src/modules/handoffs/presentation/handoff-prechecks.controller';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const SHIFT_ID = '00000000-0000-4000-8000-000000000401';
const PATIENT_ID = '00000000-0000-4000-8000-000000000501';
const PRECHECK_ID = '00000000-0000-4000-8000-000000000601';
const ITEM_ID = '00000000-0000-4000-8000-000000000701';
const EVENT_ID = '00000000-0000-4000-8000-000000000801';
const TASK_ID = '00000000-0000-4000-8000-000000000802';
const JOB_ID = '00000000-0000-4000-8000-000000000901';
const NOW = new Date('2026-08-18T02:00:00.000Z');
const SESSION_ID = 'handoff-precheck-session';

describe('Handoff precheck public API (e2e)', () => {
  let app: INestApplication;
  const service = {
    create: jest
      .fn()
      .mockResolvedValue({ precheckId: PRECHECK_ID, status: 'QUEUED' }),
    get: jest.fn().mockResolvedValue({
      precheckId: PRECHECK_ID,
      version: 1,
      job: {
        jobId: JOB_ID,
        status: 'SUCCEEDED',
        failureCode: null,
        retryable: null,
      },
      modelVersion: 'deterministic-handoff-precheck-v1',
      contractVersion: 'handoff-precheck-v1',
      generatedAt: NOW,
      items: [
        {
          itemId: ITEM_ID,
          patientId: PATIENT_ID,
          severity: 'CRITICAL',
          question: '현재 체온을 확인해 주세요.',
          reason: '관찰 기록과 미완료 업무가 있습니다.',
          evidence: [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: EVENT_ID,
              sourceReference: 'timeline:event:801',
              occurredAt: NOW,
              excerptKind: 'SUMMARY',
              excerpt: '체온 상승 관찰',
            },
            {
              sourceType: 'TASK',
              sourceId: TASK_ID,
              sourceReference: 'task:802',
              occurredAt: null,
              excerptKind: 'TASK_TITLE',
              excerpt: '해열 후 체온 재측정',
            },
          ],
          answer: null,
          comment: null,
          version: 1,
        },
      ],
    }),
    answerItem: jest.fn().mockResolvedValue({
      itemId: ITEM_ID,
      answer: 'INCLUDE_HANDOFF',
      version: 2,
    }),
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [HandoffPrechecksController],
      providers: [
        { provide: HandoffPrechecksService, useValue: service },
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

  it('POST /handoff-prechecks는 202 receipt를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/handoff-prechecks')
      .set('X-Demo-Session-Id', SESSION_ID)
      .set('X-Idempotency-Key', 'precheck-key')
      .send({ shiftId: SHIFT_ID, targetDuty: 'EVENING', date: '2026-08-18' })
      .expect(202);

    expect(response.body.data).toEqual({
      precheckId: PRECHECK_ID,
      status: 'QUEUED',
    });
    expect(service.create).toHaveBeenCalledWith(
      { datasetId: DATASET_ID, actorId: ACTOR_ID, wardId: WARD_ID },
      expect.objectContaining({ shiftId: SHIFT_ID }),
      'precheck-key',
      expect.any(String),
    );
  });

  it('GET은 Timeline SUMMARY와 Task title excerpt만 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/handoff-prechecks/${PRECHECK_ID}`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .expect(200);

    expect(response.body.data.items[0].evidence).toEqual([
      {
        sourceType: 'TIMELINE_EVENT',
        sourceId: EVENT_ID,
        sourceReference: 'timeline:event:801',
        occurredAt: NOW.toISOString(),
        excerptKind: 'SUMMARY',
        excerpt: '체온 상승 관찰',
      },
      {
        sourceType: 'TASK',
        sourceId: TASK_ID,
        sourceReference: 'task:802',
        occurredAt: null,
        excerptKind: 'TASK_TITLE',
        excerpt: '해열 후 체온 재측정',
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('audio');
    expect(JSON.stringify(response.body)).not.toContain('UTTERANCE');
  });

  it('PATCH는 version 조건부 답변 결과를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/handoff-prechecks/${PRECHECK_ID}/items/${ITEM_ID}`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .send({ answer: 'INCLUDE_HANDOFF', comment: '인계 필요', version: 1 })
      .expect(200);

    expect(response.body.data).toEqual({
      itemId: ITEM_ID,
      answer: 'INCLUDE_HANDOFF',
      version: 2,
    });
  });

  it('demo session header가 없으면 동일하게 401로 숨긴다', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/handoff-prechecks/${PRECHECK_ID}`)
      .expect(401);
  });
});
