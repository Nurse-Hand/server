import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { VersionConflictError } from '../../src/common/errors/version-conflict.error';
import { RequestIdMiddleware } from '../../src/common/http/request-id.middleware';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import type { RequestWithDemoSessionContext } from '../../src/modules/demo/presentation/demo-session.guard';
import { TimelineEventService } from '../../src/modules/timeline/application/timeline-event.service';
import { TimelineEventNotFoundError } from '../../src/modules/timeline/domain/timeline.errors';
import { TimelineEventsController } from '../../src/modules/timeline/presentation/timeline-events.controller';

const DEMO_SESSION_ID = 'synthetic-timeline-session';
const DATASET_ID = '10000000-0000-4000-8000-000000000101';
const ACTOR_ID = '10000000-0000-4000-8000-000000000201';
const WARD_ID = '10000000-0000-4000-8000-000000000301';
const EVENT_ID = '10000000-0000-4000-8000-000000000401';
const PATIENT_ID = '10000000-0000-4000-8000-000000000402';
const REQUEST_ID = '10000000-0000-4000-8000-000000000501';
const NOW = new Date('2026-08-20T02:00:00.000Z');

const DEMO_CONTEXT: DemoSessionContext = {
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
};

class FixedDemoSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const httpRequest = context
      .switchToHttp()
      .getRequest<RequestWithDemoSessionContext>();
    const header = httpRequest.headers['x-demo-session-id'];
    const sessionId = Array.isArray(header) ? header[0] : header;

    if (sessionId !== DEMO_SESSION_ID) {
      throw new UnauthorizedException();
    }

    httpRequest.demoSessionContext = DEMO_CONTEXT;
    return true;
  }
}

describe('Timeline events public API (isolated e2e)', () => {
  let app: INestApplication;
  const service = {
    update: jest.fn(),
    history: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [TimelineEventsController],
      providers: [{ provide: TimelineEventService, useValue: service }],
    }).compile();

    app = moduleFixture.createNestApplication();
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(
      (incomingRequest: Request, response: Response, next: NextFunction) =>
        requestIdMiddleware.use(incomingRequest, response, next),
    );
    app.useGlobalGuards(new FixedDemoSessionGuard());
    configureApplication(app);
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    service.update.mockResolvedValue({
      eventId: EVENT_ID,
      patientId: PATIENT_ID,
      occurredAt: NOW,
      type: 'OBSERVATION',
      clinicalCategory: 'PAIN',
      source: 'AI_AUDIO',
      sourceReference: 'timeline:event:801',
      summary: '통증 NRS 4점으로 감소',
      important: true,
      confirmationStatus: 'CONFIRMED',
      version: 3,
      updatedAt: NOW,
      updatedByActorId: ACTOR_ID,
    });
    service.history.mockResolvedValue([
      {
        historyEntryId: '10000000-0000-4000-8000-000000000601',
        actorId: ACTOR_ID,
        editedAt: NOW,
        version: 3,
        changes: {
          summary: {
            before: '통증 NRS 5점',
            after: '통증 NRS 4점으로 감소',
          },
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH /timeline-events/{eventId}는 수정 결과를 envelope로 반환한다', async () => {
    const body = {
      summary: '통증 NRS 4점으로 감소',
      important: true,
      confirmationStatus: 'CONFIRMED',
      version: 2,
    };
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/timeline-events/${EVENT_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send(body)
      .expect(200);

    expect(service.update).toHaveBeenCalledWith(DEMO_CONTEXT, EVENT_ID, body);
    expect(response.body).toEqual({
      data: {
        eventId: EVENT_ID,
        patientId: PATIENT_ID,
        occurredAt: NOW.toISOString(),
        type: 'OBSERVATION',
        clinicalCategory: 'PAIN',
        source: 'AI_AUDIO',
        sourceReference: 'timeline:event:801',
        summary: '통증 NRS 4점으로 감소',
        important: true,
        confirmationStatus: 'CONFIRMED',
        version: 3,
        updatedAt: NOW.toISOString(),
        updatedByActorId: ACTOR_ID,
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('GET /timeline-events/{eventId}/history는 변경 이력을 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/timeline-events/${EVENT_ID}/history`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(200);

    expect(service.history).toHaveBeenCalledWith(DEMO_CONTEXT, EVENT_ID);
    expect(response.body).toEqual({
      data: {
        items: [
          {
            historyEntryId: '10000000-0000-4000-8000-000000000601',
            actorId: ACTOR_ID,
            editedAt: NOW.toISOString(),
            version: 3,
            changes: {
              summary: {
                before: '통증 NRS 5점',
                after: '통증 NRS 4점으로 감소',
              },
            },
          },
        ],
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('validation, 404, 409 envelope를 유지한다', async () => {
    const invalid = await request(app.getHttpServer())
      .patch(`/api/v1/timeline-events/${EVENT_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({ version: 2 })
      .expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_FAILED');

    service.update.mockRejectedValueOnce(new TimelineEventNotFoundError());
    const hidden = await request(app.getHttpServer())
      .patch(`/api/v1/timeline-events/${EVENT_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({ summary: '변경', version: 2 })
      .expect(404);
    expect(hidden.body.error.code).toBe('TIMELINE_EVENT_NOT_FOUND');

    service.update.mockRejectedValueOnce(new VersionConflictError(2, 3));
    const conflict = await request(app.getHttpServer())
      .patch(`/api/v1/timeline-events/${EVENT_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({ summary: '변경', version: 2 })
      .expect(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
  });
});
