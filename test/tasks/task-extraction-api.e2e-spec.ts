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
import { RequestIdMiddleware } from '../../src/common/http/request-id.middleware';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import type { RequestWithDemoSessionContext } from '../../src/modules/demo/presentation/demo-session.guard';
import type { TaskExtractionJobView } from '../../src/modules/tasks/application/ports/task.repository';
import { TaskService } from '../../src/modules/tasks/application/task.service';
import {
  TaskApplyInvalidError,
  TaskCandidateAlreadyAppliedError,
  TaskExtractionEvidenceInvalidError,
  TaskNotFoundError,
} from '../../src/modules/tasks/domain/task.errors';
import { TasksController } from '../../src/modules/tasks/presentation/tasks.controller';

const DEMO_SESSION_ID = 'synthetic-task-extraction-session';
const DATASET_ID = '10000000-0000-4000-8000-000000000101';
const ACTOR_ID = '10000000-0000-4000-8000-000000000201';
const WARD_ID = '10000000-0000-4000-8000-000000000301';
const PATIENT_ID = '10000000-0000-4000-8000-000000000401';
const JOB_ID = '10000000-0000-4000-8000-000000000501';
const CANDIDATE_ID = '10000000-0000-4000-8000-000000000601';
const ROUNDING_SESSION_ID = '10000000-0000-4000-8000-000000000701';
const RECORD_ID = '10000000-0000-4000-8000-000000000801';
const REQUEST_ID = '10000000-0000-4000-8000-000000000901';
const IDEMPOTENCY_KEY = 'task-extraction-api-key';

const DEMO_CONTEXT: DemoSessionContext = {
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
};

const SUCCEEDED_JOB: TaskExtractionJobView = {
  jobId: JOB_ID,
  status: 'SUCCEEDED',
  failureCode: null,
  retryable: null,
  candidates: [
    {
      id: CANDIDATE_ID,
      patientId: PATIENT_ID,
      title: '통증 재평가',
      description: null,
      dueAt: new Date('2026-08-19T05:00:00.000Z'),
      workDate: new Date('2026-08-19T00:00:00.000Z'),
      suggestedPriority: 'HIGH',
      reasons: ['현재 근무 종료 전 마감'],
      confidence: 'MEDIUM',
      evidence: [{ sourceType: 'TIMELINE_EVENT', sourceId: RECORD_ID }],
      duplicateTaskId: null,
      appliedTaskId: null,
    },
  ],
  createdAt: new Date('2026-08-19T01:00:00.000Z'),
  updatedAt: new Date('2026-08-19T01:01:00.000Z'),
};

type TaskServiceDouble = jest.Mocked<
  Pick<
    TaskService,
    'reserveExtraction' | 'findExtractionJob' | 'applyCandidates'
  >
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

describe('Task extraction public API (isolated e2e)', () => {
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
    taskService.reserveExtraction.mockResolvedValue({
      jobId: JOB_ID,
      status: 'QUEUED',
      isReplay: false,
    });
    taskService.findExtractionJob.mockResolvedValue(SUCCEEDED_JOB);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /task-extraction-jobs가 demo context로 접수하고 202 envelope를 반환한다', async () => {
    const body = {
      roundingSessionId: ROUNDING_SESSION_ID,
      recordIds: [RECORD_ID],
    };
    const response = await request(app.getHttpServer())
      .post('/api/v1/task-extraction-jobs')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send(body)
      .expect(202);

    expect(taskService.reserveExtraction).toHaveBeenCalledWith(
      DEMO_CONTEXT,
      IDEMPOTENCY_KEY,
      REQUEST_ID,
      body,
    );
    expect(response.body).toEqual({
      data: { jobId: JOB_ID, status: 'QUEUED' },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('GET /task-extraction-jobs/{jobId}가 후보·근거·categorical AI 제안을 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/task-extraction-jobs/${JOB_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(200);

    expect(taskService.findExtractionJob).toHaveBeenCalledWith(
      DEMO_CONTEXT,
      JOB_ID,
    );
    expect(response.body).toEqual({
      data: {
        jobId: JOB_ID,
        status: 'SUCCEEDED',
        failure: null,
        candidates: [
          {
            candidateId: CANDIDATE_ID,
            patientId: PATIENT_ID,
            title: '통증 재평가',
            description: null,
            dueAt: '2026-08-19T05:00:00.000Z',
            workDate: '2026-08-19',
            aiSuggestion: {
              suggestedPriority: 'HIGH',
              reasons: ['현재 근무 종료 전 마감'],
              confidence: 'MEDIUM',
            },
            evidence: [{ sourceType: 'TIMELINE_EVENT', sourceId: RECORD_ID }],
            duplicateTaskId: null,
            appliedTaskId: null,
          },
        ],
        createdAt: '2026-08-19T01:00:00.000Z',
        updatedAt: '2026-08-19T01:01:00.000Z',
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('DTO validation이 scope 주입, 중복 record, 잘못된 UUID와 key 누락을 거부한다', async () => {
    const injectedScope = await request(app.getHttpServer())
      .post('/api/v1/task-extraction-jobs')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({
        roundingSessionId: ROUNDING_SESSION_ID,
        recordIds: [RECORD_ID],
        wardId: WARD_ID,
      });
    const duplicateRecords = await request(app.getHttpServer())
      .post('/api/v1/task-extraction-jobs')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({
        roundingSessionId: ROUNDING_SESSION_ID,
        recordIds: [RECORD_ID, RECORD_ID],
      });
    const invalidJobId = await request(app.getHttpServer())
      .get('/api/v1/task-extraction-jobs/not-a-uuid')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID);
    const missingKey = await request(app.getHttpServer())
      .post('/api/v1/task-extraction-jobs')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({
        roundingSessionId: ROUNDING_SESSION_ID,
        recordIds: [RECORD_ID],
      });

    expect({
      injectedScope: injectedScope.status,
      duplicateRecords: duplicateRecords.status,
      invalidJobId: invalidJobId.status,
      missingKey: missingKey.status,
    }).toEqual({
      injectedScope: 400,
      duplicateRecords: 400,
      invalidJobId: 400,
      missingKey: 400,
    });
    expect(taskService.reserveExtraction).not.toHaveBeenCalled();
    expect(taskService.findExtractionJob).not.toHaveBeenCalled();
  });

  it.each([
    ['TASK_AI_TIMEOUT', true],
    ['TASK_AI_RESPONSE_INVALID', false],
  ] as const)(
    'FAILED job의 %s 상태를 안전한 failure 응답으로 매핑한다',
    async (failureCode, retryable) => {
      taskService.findExtractionJob.mockResolvedValueOnce({
        ...SUCCEEDED_JOB,
        status: 'FAILED',
        failureCode,
        retryable,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/task-extraction-jobs/${JOB_ID}`)
        .set('X-Demo-Session-Id', DEMO_SESSION_ID)
        .set('X-Request-Id', REQUEST_ID)
        .expect(200);

      expect(response.body).toEqual({
        data: {
          jobId: JOB_ID,
          status: 'FAILED',
          failure: { code: failureCode, retryable },
          candidates: [],
          createdAt: '2026-08-19T01:00:00.000Z',
          updatedAt: '2026-08-19T01:01:00.000Z',
        },
        meta: { requestId: REQUEST_ID },
      });
    },
  );

  it('Evidence snapshot invalid를 502 공통 error envelope로 반환한다', async () => {
    taskService.reserveExtraction.mockRejectedValueOnce(
      new TaskExtractionEvidenceInvalidError(),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/task-extraction-jobs')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({
        roundingSessionId: ROUNDING_SESSION_ID,
        recordIds: [RECORD_ID],
      })
      .expect(502);

    expect(response.body).toEqual({
      error: {
        code: 'TASK_EXTRACTION_EVIDENCE_INVALID',
        message: '라운딩 근거를 안전하게 처리할 수 없습니다.',
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('scope 밖 job의 404를 공통 error envelope로 반환한다', async () => {
    taskService.findExtractionJob.mockRejectedValueOnce(
      new TaskNotFoundError(),
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/task-extraction-jobs/${JOB_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'TASK_NOT_FOUND',
        message: '업무 또는 업무 추출 결과를 찾을 수 없습니다.',
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('선택·수정 후보를 demo context와 idempotency key로 반영한다', async () => {
    taskService.applyCandidates.mockResolvedValueOnce({
      createdTaskIds: [CANDIDATE_ID],
      skippedCandidateIds: [],
      isReplay: false,
    });
    const body = {
      items: [
        {
          candidateId: CANDIDATE_ID,
          selected: true,
          title: '수정한 업무',
          priorityOverride: 'CRITICAL',
        },
      ],
    };
    const response = await request(app.getHttpServer())
      .post(`/api/v1/task-extraction-jobs/${JOB_ID}/apply`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send(body)
      .expect(201);

    expect(taskService.applyCandidates).toHaveBeenCalledWith(
      DEMO_CONTEXT,
      JOB_ID,
      IDEMPOTENCY_KEY,
      body,
    );
    expect(response.body).toEqual({
      data: { createdTaskIds: [CANDIDATE_ID], skippedCandidateIds: [] },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('apply DTO와 선택 규칙 오류를 400/422 envelope로 반환한다', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/task-extraction-jobs/${JOB_ID}/apply`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({ items: [{ candidateId: 'invalid', selected: true }] })
      .expect(400);

    taskService.applyCandidates.mockRejectedValueOnce(
      new TaskApplyInvalidError(),
    );
    const response = await request(app.getHttpServer())
      .post(`/api/v1/task-extraction-jobs/${JOB_ID}/apply`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({ items: [{ candidateId: CANDIDATE_ID, selected: false }] })
      .expect(422);
    expect(response.body.error.code).toBe('TASK_APPLY_INVALID');
  });

  it('이미 반영된 후보를 409 envelope로 반환한다', async () => {
    taskService.applyCandidates.mockRejectedValueOnce(
      new TaskCandidateAlreadyAppliedError(),
    );
    const response = await request(app.getHttpServer())
      .post(`/api/v1/task-extraction-jobs/${JOB_ID}/apply`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', IDEMPOTENCY_KEY)
      .send({ items: [{ candidateId: CANDIDATE_ID, selected: true }] })
      .expect(409);
    expect(response.body).toEqual({
      error: {
        code: 'TASK_CANDIDATE_ALREADY_APPLIED',
        message: '이미 반영된 업무 후보가 포함되어 있습니다.',
      },
      meta: { requestId: REQUEST_ID },
    });
  });
});

function createTaskServiceDouble(): TaskServiceDouble {
  return {
    reserveExtraction: jest.fn(),
    findExtractionJob: jest.fn(),
    applyCandidates: jest.fn(),
  };
}
