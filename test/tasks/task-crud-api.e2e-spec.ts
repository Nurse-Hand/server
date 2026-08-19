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
import type { TaskView } from '../../src/modules/tasks/application/ports/task.repository';
import { TaskService } from '../../src/modules/tasks/application/task.service';
import {
  TaskCurrentDutyUnresolvedError,
  TaskNotFoundError,
} from '../../src/modules/tasks/domain/task.errors';
import { TasksController } from '../../src/modules/tasks/presentation/tasks.controller';

const DEMO_SESSION_ID = 'synthetic-task-crud-session';
const DATASET_ID = '10000000-0000-4000-8000-000000000101';
const ACTOR_ID = '10000000-0000-4000-8000-000000000201';
const WARD_ID = '10000000-0000-4000-8000-000000000301';
const PATIENT_ID = '10000000-0000-4000-8000-000000000401';
const TASK_ID = '10000000-0000-4000-8000-000000000501';
const REQUEST_ID = '10000000-0000-4000-8000-000000000601';
const IDEMPOTENCY_KEY = 'task-crud-api-key';

const DEMO_CONTEXT: DemoSessionContext = {
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
};

const TASK_ROW: TaskView = {
  id: TASK_ID,
  patientId: PATIENT_ID,
  title: '통증 재평가',
  description: null,
  dueAt: new Date('2026-08-19T05:00:00.000Z'),
  workDate: new Date('2026-08-19T00:00:00.000Z'),
  status: 'TODO',
  source: 'MANUAL',
  aiSuggestedPriority: null,
  aiReasons: [],
  aiConfidence: null,
  rulePriority: 'HIGH',
  confirmedPriority: null,
  effectivePriority: 'HIGH',
  version: 1,
  createdAt: new Date('2026-08-19T01:00:00.000Z'),
  updatedAt: new Date('2026-08-19T01:00:00.000Z'),
};

const PUBLIC_TASK = {
  taskId: TASK_ID,
  patientId: PATIENT_ID,
  title: '통증 재평가',
  description: null,
  dueAt: '2026-08-19T05:00:00.000Z',
  workDate: '2026-08-19',
  status: 'TODO',
  source: 'MANUAL',
  aiSuggestion: null,
  rulePriority: 'HIGH',
  confirmedPriority: null,
  effectivePriority: 'HIGH',
  version: 1,
  createdAt: '2026-08-19T01:00:00.000Z',
  updatedAt: '2026-08-19T01:00:00.000Z',
};

type TaskServiceDouble = jest.Mocked<
  Pick<TaskService, 'list' | 'create' | 'update'>
>;

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

describe('Task CRUD public API (isolated e2e)', () => {
  let app: INestApplication;
  let taskService: TaskServiceDouble;

  beforeAll(async () => {
    taskService = createTaskServiceDouble();
    const moduleFixture = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TaskService, useValue: taskService }],
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
    taskService.list.mockResolvedValue({ items: [TASK_ROW], nextCursor: null });
    taskService.create.mockResolvedValue({ task: TASK_ROW, isReplay: false });
    taskService.update.mockResolvedValue({
      ...TASK_ROW,
      status: 'DONE',
      version: 2,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /tasks가 demo context와 filter를 사용하고 공통 envelope를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/tasks?date=2026-08-19&status=TODO&patientId=${PATIENT_ID}&sort=priority`,
      )
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(200);

    expect(taskService.list).toHaveBeenCalledWith(DEMO_CONTEXT, {
      date: '2026-08-19',
      status: 'TODO',
      patientId: PATIENT_ID,
      sort: 'priority',
      limit: 20,
    });
    expect(response.body).toEqual({
      data: { items: [PUBLIC_TASK] },
      meta: { requestId: REQUEST_ID, page: { nextCursor: null } },
    });
  });

  it('POST /tasks가 demo context와 idempotency 정보를 전달하고 201을 반환한다', async () => {
    const body = {
      patientId: PATIENT_ID,
      title: '통증 재평가',
      description: null,
      dueAt: '2026-08-19T14:00:00+09:00',
      priorityOverride: null,
    };
    const response = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send(body)
      .expect(201);

    expect(taskService.create).toHaveBeenCalledWith(
      DEMO_CONTEXT,
      IDEMPOTENCY_KEY,
      REQUEST_ID,
      body,
    );
    expect(response.body).toEqual({
      data: PUBLIC_TASK,
      meta: { requestId: REQUEST_ID },
    });
  });

  it('PATCH /tasks/{taskId}가 version 요청과 demo context를 전달한다', async () => {
    const body = { status: 'DONE', version: 1 };
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${TASK_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send(body)
      .expect(200);

    expect(taskService.update).toHaveBeenCalledWith(
      DEMO_CONTEXT,
      TASK_ID,
      body,
    );
    expect(response.body.data).toMatchObject({
      taskId: TASK_ID,
      status: 'DONE',
      version: 2,
    });
    expect(response.body.meta).toEqual({ requestId: REQUEST_ID });
  });

  it('DTO validation이 scope 주입과 잘못된 date, limit, timestamp, patch를 거부한다', async () => {
    const injectedQuery = await request(app.getHttpServer())
      .get(`/api/v1/tasks?date=2026-08-19&wardId=${WARD_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID);
    const invalidDate = await request(app.getHttpServer())
      .get('/api/v1/tasks?date=2026-02-30')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID);
    const invalidLimit = await request(app.getHttpServer())
      .get('/api/v1/tasks?date=2026-08-19&limit=51')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID);
    const injectedBody = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({
        title: '업무',
        dueAt: '2026-08-19T14:00:00+09:00',
        actorId: ACTOR_ID,
      });
    const invalidTimestamp = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({ title: '업무', dueAt: '2026-08-19T14:00:00' });
    const emptyPatch = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${TASK_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({ version: 1 });

    expect({
      injectedQuery: injectedQuery.status,
      invalidDate: invalidDate.status,
      invalidLimit: invalidLimit.status,
      injectedBody: injectedBody.status,
      invalidTimestamp: invalidTimestamp.status,
      emptyPatch: emptyPatch.status,
    }).toEqual({
      injectedQuery: 400,
      invalidDate: 400,
      invalidLimit: 400,
      injectedBody: 400,
      invalidTimestamp: 400,
      emptyPatch: 400,
    });

    for (const response of [
      injectedQuery,
      invalidDate,
      invalidLimit,
      injectedBody,
      invalidTimestamp,
      emptyPatch,
    ]) {
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.meta.requestId).toEqual(expect.any(String));
    }
    expect(taskService.list).not.toHaveBeenCalled();
    expect(taskService.create).not.toHaveBeenCalled();
    expect(taskService.update).not.toHaveBeenCalled();
  });

  it('application의 404, 409, current duty 422를 공통 error envelope로 매핑한다', async () => {
    taskService.list.mockRejectedValueOnce(new TaskNotFoundError());
    const notFound = await request(app.getHttpServer())
      .get('/api/v1/tasks?date=2026-08-19')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(404);

    taskService.update.mockRejectedValueOnce(new VersionConflictError(1, 2));
    const conflict = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${TASK_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send({ status: 'DONE', version: 1 })
      .expect(409);

    taskService.list.mockRejectedValueOnce(
      new TaskCurrentDutyUnresolvedError(),
    );
    const unprocessable = await request(app.getHttpServer())
      .get('/api/v1/tasks?date=2026-08-19')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(422);

    expect(notFound.body).toEqual({
      error: {
        code: 'TASK_NOT_FOUND',
        message: '업무 또는 업무 추출 결과를 찾을 수 없습니다.',
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
    expect(unprocessable.body).toEqual({
      error: {
        code: 'TASK_CURRENT_DUTY_UNRESOLVED',
        message: '현재 근무를 하나로 결정할 수 없습니다.',
      },
      meta: { requestId: REQUEST_ID },
    });
  });
});

function createTaskServiceDouble(): TaskServiceDouble {
  return {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
}
