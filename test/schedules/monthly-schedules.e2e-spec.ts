import type { NextFunction, Request, Response } from 'express';
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { VersionConflictError } from '../../src/common/errors/version-conflict.error';
import { RequestIdMiddleware } from '../../src/common/http/request-id.middleware';
import type { RequestWithDemoSessionContext } from '../../src/modules/demo/presentation/demo-session.guard';
import { MonthlyScheduleService } from '../../src/modules/schedules/application/monthly-schedule.service';
import {
  MONTHLY_SCHEDULE_REPOSITORY,
  type MonthlyScheduleRepository,
} from '../../src/modules/schedules/application/ports/monthly-schedule.repository';
import { MonthlyScheduleNotFoundError } from '../../src/modules/schedules/domain/monthly-schedule.errors';
import { MonthlySchedulesController } from '../../src/modules/schedules/presentation/monthly-schedules.controller';

const DEMO_SESSION_ID = 'demo-session-schedule';
const REQUEST_ID = '00000000-0000-4000-8000-000000000201';
const CONTEXT = {
  datasetId: '00000000-0000-4000-8000-000000000202',
  actorId: '00000000-0000-4000-8000-000000000203',
  wardId: '00000000-0000-4000-8000-000000000204',
};
const SCHEDULE = {
  yearMonth: '2026-08',
  version: 1,
  entries: [
    { date: '2026-08-01', duty: 'DAY' as const },
    { date: '2026-08-02', duty: 'OFF' as const },
  ],
  totals: { DAY: 1, EVENING: 0, NIGHT: 0, OFF: 1 },
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

    httpRequest.demoSessionContext = CONTEXT;
    return true;
  }
}

describe('Monthly schedules public API (isolated e2e)', () => {
  let app: INestApplication;
  let repository: jest.Mocked<MonthlyScheduleRepository>;

  beforeAll(async () => {
    repository = {
      save: jest.fn(),
      find: jest.fn(),
    };
    const moduleFixture = await Test.createTestingModule({
      controllers: [MonthlySchedulesController],
      providers: [
        MonthlyScheduleService,
        { provide: MONTHLY_SCHEDULE_REPOSITORY, useValue: repository },
      ],
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
    repository.find.mockResolvedValue(SCHEDULE);
    repository.save.mockResolvedValue({ schedule: SCHEDULE, isReplay: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET이 demo scope의 월별 일정과 합계를 공통 envelope로 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(200);

    expect(repository.find).toHaveBeenCalledWith(CONTEXT, '2026-08');
    expect(response.body).toEqual({
      data: SCHEDULE,
      meta: { requestId: REQUEST_ID },
    });
  });

  it('PUT이 version, canonical entries와 멱등성 키를 전달한다', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', 'schedule-save-1')
      .send({
        expectedVersion: 0,
        entries: [
          { date: '2026-08-02', duty: 'OFF' },
          { date: '2026-08-01', duty: 'DAY' },
        ],
      })
      .expect(200);

    expect(repository.save).toHaveBeenCalledWith({
      context: CONTEXT,
      yearMonth: '2026-08',
      expectedVersion: 0,
      entries: [
        { date: '2026-08-01', duty: 'DAY' },
        { date: '2026-08-02', duty: 'OFF' },
      ],
      idempotencyKey: 'schedule-save-1',
      requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(response.body).toEqual({
      data: SCHEDULE,
      meta: { requestId: REQUEST_ID },
    });
  });

  it('잘못된 path, header, 날짜, 중복과 scope 주입을 거부한다', async () => {
    const invalidMonth = await request(app.getHttpServer())
      .get('/api/v1/me/schedules/2026-13')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID);
    const missingKey = await request(app.getHttpServer())
      .put('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({ expectedVersion: 0, entries: [] });
    const impossibleDate = await request(app.getHttpServer())
      .put('/api/v1/me/schedules/2026-02')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', 'invalid-date')
      .send({
        expectedVersion: 0,
        entries: [{ date: '2026-02-29', duty: 'DAY' }],
      });
    const duplicateDate = await request(app.getHttpServer())
      .put('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', 'duplicate-date')
      .send({
        expectedVersion: 0,
        entries: [
          { date: '2026-08-01', duty: 'DAY' },
          { date: '2026-08-01', duty: 'OFF' },
        ],
      });
    const injectedScope = await request(app.getHttpServer())
      .put('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', 'injected-scope')
      .send({ expectedVersion: 0, entries: [], actorId: CONTEXT.actorId });

    expect({
      invalidMonth: invalidMonth.status,
      missingKey: missingKey.status,
      impossibleDate: impossibleDate.status,
      duplicateDate: duplicateDate.status,
      injectedScope: injectedScope.status,
    }).toEqual({
      invalidMonth: 400,
      missingKey: 400,
      impossibleDate: 422,
      duplicateDate: 400,
      injectedScope: 400,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('다른 scope의 없음과 stale version을 공통 오류로 변환한다', async () => {
    repository.find.mockRejectedValueOnce(new MonthlyScheduleNotFoundError());
    const notFound = await request(app.getHttpServer())
      .get('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(404);

    repository.save.mockRejectedValueOnce(new VersionConflictError(1, 2));
    const conflict = await request(app.getHttpServer())
      .put('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', 'stale-version')
      .send({ expectedVersion: 1, entries: [] })
      .expect(409);

    expect(notFound.body).toEqual({
      error: {
        code: 'MONTHLY_SCHEDULE_NOT_FOUND',
        message: '등록된 월별 근무표를 찾을 수 없습니다.',
      },
      meta: { requestId: REQUEST_ID },
    });
    expect(conflict.body).toEqual({
      error: {
        code: 'VERSION_CONFLICT',
        message:
          '다른 변경이 먼저 반영되었습니다. 최신 상태를 다시 조회해 주세요.',
        details: { expectedVersion: 1, actualVersion: 2 },
      },
      meta: { requestId: REQUEST_ID },
    });
  });
});
