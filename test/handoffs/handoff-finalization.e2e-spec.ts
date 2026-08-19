import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { VersionConflictError } from '../../src/common/errors/version-conflict.error';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionGuard } from '../../src/modules/demo/presentation/demo-session.guard';
import { HandoffFinalizationService } from '../../src/modules/handoffs/application/handoff-finalization.service';
import {
  HandoffCriticalAnswerRequiredError,
  HandoffNotFoundError,
} from '../../src/modules/handoffs/domain/handoff.errors';
import { HandoffFinalizationController } from '../../src/modules/handoffs/presentation/handoff-finalization.controller';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const NOW = new Date('2026-08-19T03:00:00.000Z');
const SESSION_ID = 'handoff-finalization-session';

describe('Handoff finalization public API (e2e)', () => {
  let app: INestApplication;
  const service = {
    finalize: jest.fn(),
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [HandoffFinalizationController],
      providers: [
        { provide: HandoffFinalizationService, useValue: service },
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
    service.finalize.mockReset().mockResolvedValue({
      handoffId: HANDOFF_ID,
      status: 'FINALIZED',
      finalizedAt: NOW,
      version: 3,
    });
  });

  afterAll(async () => app.close());

  it('POST /handoffs/{id}/finalize는 201 FINALIZED envelope를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/handoffs/${HANDOFF_ID}/finalize`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .set('X-Idempotency-Key', 'finalize-key')
      .send({ version: 2, unverifiedHandling: 'KEEP_WITH_WARNING' })
      .expect(201);

    expect(response.body).toEqual({
      data: {
        handoffId: HANDOFF_ID,
        status: 'FINALIZED',
        finalizedAt: NOW.toISOString(),
        version: 3,
      },
      meta: { requestId: expect.any(String) },
    });
    expect(service.finalize).toHaveBeenCalledWith(
      { datasetId: DATASET_ID, actorId: ACTOR_ID, wardId: WARD_ID },
      HANDOFF_ID,
      { version: 2, unverifiedHandling: 'KEEP_WITH_WARNING' },
      'finalize-key',
      expect.any(String),
    );
  });

  it('idempotency key 누락과 잘못된 body를 400 envelope로 거부한다', async () => {
    const missingKey = await request(app.getHttpServer())
      .post(`/api/v1/handoffs/${HANDOFF_ID}/finalize`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .send({ version: 2, unverifiedHandling: 'RESOLVED' })
      .expect(400);
    expect(missingKey.body).toMatchObject({
      error: { code: 'BAD_REQUEST' },
      meta: { requestId: expect.any(String) },
    });

    const invalidBody = await request(app.getHttpServer())
      .post(`/api/v1/handoffs/${HANDOFF_ID}/finalize`)
      .set('X-Demo-Session-Id', SESSION_ID)
      .set('X-Idempotency-Key', 'finalize-key')
      .send({ version: 0, unverifiedHandling: 'IGNORE' })
      .expect(400);
    expect(invalidBody.body.error.code).toBe('VALIDATION_FAILED');
    expect(service.finalize).not.toHaveBeenCalled();
  });

  it('scope 밖 handoff를 동일한 404로 숨긴다', async () => {
    service.finalize.mockRejectedValueOnce(new HandoffNotFoundError());
    const response = await finalizeRequest(app).expect(404);
    expect(response.body.error.code).toBe('HANDOFF_NOT_FOUND');
  });

  it('CRITICAL 미응답 정책 위반을 422로 반환한다', async () => {
    service.finalize.mockRejectedValueOnce(
      new HandoffCriticalAnswerRequiredError(),
    );
    const response = await finalizeRequest(app).expect(422);
    expect(response.body.error.code).toBe('HANDOFF_CRITICAL_ANSWER_REQUIRED');
  });

  it('stale version을 409로 반환한다', async () => {
    service.finalize.mockRejectedValueOnce(new VersionConflictError(2, 3));
    const response = await finalizeRequest(app).expect(409);
    expect(response.body.error.code).toBe('VERSION_CONFLICT');
  });
});

function finalizeRequest(app: INestApplication) {
  return request(app.getHttpServer())
    .post(`/api/v1/handoffs/${HANDOFF_ID}/finalize`)
    .set('X-Demo-Session-Id', SESSION_ID)
    .set('X-Idempotency-Key', 'finalize-key')
    .send({ version: 2, unverifiedHandling: 'KEEP_WITH_WARNING' });
}
