import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionGuard } from '../../src/modules/demo/presentation/demo-session.guard';
import { HandoffActivityService } from '../../src/modules/handoffs/application/handoff-activity.service';
import {
  HandoffAcknowledgementTransitionError,
  HandoffNotFoundError,
} from '../../src/modules/handoffs/domain/handoff.errors';
import { HandoffAcknowledgementsController } from '../../src/modules/handoffs/presentation/handoff-acknowledgements.controller';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000202';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const ACK_ID = '00000000-0000-4000-8000-000000000701';
const NOW = new Date('2026-08-19T03:00:00.000Z');

describe('Handoff activity public API (e2e)', () => {
  let app: INestApplication;
  const service = { acknowledge: jest.fn(), history: jest.fn() };
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [HandoffAcknowledgementsController],
      providers: [
        { provide: HandoffActivityService, useValue: service },
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
  beforeEach(() => {
    jest.clearAllMocks();
    service.acknowledge.mockResolvedValue({
      acknowledgementId: ACK_ID,
      status: 'QUESTIONED',
      acknowledgedAt: NOW,
    });
    service.history.mockResolvedValue({
      items: [
        {
          eventId: ACK_ID,
          type: 'QUESTIONED',
          actorId: ACTOR_ID,
          occurredAt: NOW,
          metadata: { status: 'QUESTIONED' },
        },
      ],
      nextCursor: null,
    });
  });
  afterAll(async () => app.close());

  it('POST acknowledgement는 201 envelope와 idempotency를 전달한다', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/handoffs/${HANDOFF_ID}/acknowledgements`)
      .set('X-Demo-Session-Id', 'session')
      .set('X-Idempotency-Key', 'ack-key')
      .send({ status: 'QUESTIONED', comment: '확인 필요' })
      .expect(201);
    expect(response.body).toEqual({
      data: {
        acknowledgementId: ACK_ID,
        status: 'QUESTIONED',
        acknowledgedAt: NOW.toISOString(),
      },
      meta: { requestId: expect.any(String) },
    });
    expect(service.acknowledge).toHaveBeenCalledWith(
      { datasetId: DATASET_ID, actorId: ACTOR_ID, wardId: WARD_ID },
      HANDOFF_ID,
      { status: 'QUESTIONED', comment: '확인 필요' },
      'ack-key',
      expect.any(String),
    );
  });

  it('GET history는 meta.page와 ISO 이력을 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/handoffs/${HANDOFF_ID}/history?limit=20`)
      .set('X-Demo-Session-Id', 'session')
      .expect(200);
    expect(response.body).toEqual({
      data: {
        items: [
          {
            eventId: ACK_ID,
            type: 'QUESTIONED',
            actorId: ACTOR_ID,
            occurredAt: NOW.toISOString(),
            metadata: { status: 'QUESTIONED' },
          },
        ],
      },
      meta: { requestId: expect.any(String), page: { nextCursor: null } },
    });
  });

  it('DTO validation과 공개 오류 envelope를 고정한다', async () => {
    const invalid = await request(app.getHttpServer())
      .post(`/api/v1/handoffs/${HANDOFF_ID}/acknowledgements`)
      .set('X-Demo-Session-Id', 'session')
      .set('X-Idempotency-Key', 'ack-key')
      .send({ status: 'INVALID' })
      .expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_FAILED');
    service.acknowledge.mockRejectedValueOnce(new HandoffNotFoundError());
    const hidden = await request(app.getHttpServer())
      .post(`/api/v1/handoffs/${HANDOFF_ID}/acknowledgements`)
      .set('X-Demo-Session-Id', 'session')
      .set('X-Idempotency-Key', 'ack-key')
      .send({ status: 'QUESTIONED' })
      .expect(404);
    expect(hidden.body.error.code).toBe('HANDOFF_NOT_FOUND');
    service.acknowledge.mockRejectedValueOnce(
      new HandoffAcknowledgementTransitionError(),
    );
    const transition = await request(app.getHttpServer())
      .post(`/api/v1/handoffs/${HANDOFF_ID}/acknowledgements`)
      .set('X-Demo-Session-Id', 'session')
      .set('X-Idempotency-Key', 'ack-key')
      .send({ status: 'QUESTIONED' })
      .expect(422);
    expect(transition.body.error.code).toBe(
      'HANDOFF_ACKNOWLEDGEMENT_TRANSITION_INVALID',
    );
  });
});
