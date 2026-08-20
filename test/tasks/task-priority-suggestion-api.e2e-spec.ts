import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { RequestIdMiddleware } from '../../src/common/http/request-id.middleware';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import type { RequestWithDemoSessionContext } from '../../src/modules/demo/presentation/demo-session.guard';
import { TaskPrioritySuggestionService } from '../../src/modules/tasks/application/task-priority-suggestion.service';
import { TaskService } from '../../src/modules/tasks/application/task.service';
import { TaskAiTimeoutError } from '../../src/modules/tasks/domain/task.errors';
import { TasksController } from '../../src/modules/tasks/presentation/tasks.controller';
import { createPublicOpenApiDocument } from '../../src/openapi/create-public-openapi-document';

const DEMO_SESSION_ID = 'synthetic-task-priority-session';
const REQUEST_ID = '10000000-0000-4000-8000-000000000601';
const BATCH_ID = '10000000-0000-4000-8000-000000000701';
const TASK_ID = '10000000-0000-4000-8000-000000000501';
const SUGGESTION_ID = '10000000-0000-4000-8000-000000000801';
const CONTEXT: DemoSessionContext = {
  datasetId: '10000000-0000-4000-8000-000000000101',
  actorId: '10000000-0000-4000-8000-000000000201',
  wardId: '10000000-0000-4000-8000-000000000301',
};

type SuggestionServiceDouble = jest.Mocked<
  Pick<TaskPrioritySuggestionService, 'createBatch'>
>;

class FixedDemoSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const httpRequest = context
      .switchToHttp()
      .getRequest<RequestWithDemoSessionContext>();
    if (httpRequest.headers['x-demo-session-id'] !== DEMO_SESSION_ID) {
      throw new UnauthorizedException();
    }
    httpRequest.demoSessionContext = CONTEXT;
    return true;
  }
}

describe('Task priority suggestion public API (isolated e2e)', () => {
  let app: INestApplication;
  let suggestionService: SuggestionServiceDouble;

  beforeAll(async () => {
    suggestionService = { createBatch: jest.fn() };
    const moduleFixture = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TaskService, useValue: {} },
        { provide: TaskPrioritySuggestionService, useValue: suggestionService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => true },
        },
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use((incoming: Request, response: Response, next: NextFunction) =>
      requestIdMiddleware.use(incoming, response, next),
    );
    app.useGlobalGuards(new FixedDemoSessionGuard());
    configureApplication(app);
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    suggestionService.createBatch.mockResolvedValue({
      batchId: BATCH_ID,
      evaluatedAt: new Date('2026-08-19T00:00:01.000Z'),
      contractVersion: 'tasks-prioritize-v1',
      suggestions: [
        {
          suggestionId: SUGGESTION_ID,
          taskId: TASK_ID,
          taskVersion: 1,
          aiScore: 8.5,
          aiSuggestedPriority: 'CRITICAL',
          reasons: ['즉시 확인 필요'],
        },
      ],
      skippedTaskIds: [],
      isReplay: false,
    });
  });

  afterAll(async () => app.close());

  it('명시적 POST 요청을 service에 전달하고 201 envelope를 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/task-priority-suggestions')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .set('X-Idempotency-Key', 'priority-key')
      .send({ date: '2026-08-19' })
      .expect(201);

    expect(suggestionService.createBatch).toHaveBeenCalledWith(
      CONTEXT,
      'priority-key',
      REQUEST_ID,
      { date: '2026-08-19' },
    );
    expect(response.body.data).toEqual({
      batchId: BATCH_ID,
      evaluatedAt: '2026-08-19T00:00:01.000Z',
      contractVersion: 'tasks-prioritize-v1',
      suggestions: [
        {
          suggestionId: SUGGESTION_ID,
          taskId: TASK_ID,
          aiScore: 8.5,
          aiSuggestedPriority: 'CRITICAL',
          reasons: ['즉시 확인 필요'],
        },
      ],
      skippedTaskIds: [],
    });
    expect(response.body.meta.requestId).toBe(REQUEST_ID);
  });

  it('OpenAPI에 저장 가능한 제안 값과 validation 상한만 노출한다', () => {
    const schema =
      createPublicOpenApiDocument(app).components?.schemas?.[
        'TaskPrioritySuggestionItemDto'
      ];
    expect(schema).toMatchObject({
      properties: {
        aiScore: { minimum: 0 },
        aiSuggestedPriority: { enum: ['CRITICAL', 'HIGH', 'NORMAL'] },
        reasons: { maxItems: 5, items: { maxLength: 200 } },
      },
    });
  });

  it('date 누락을 service 호출 전에 400으로 거부한다', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/task-priority-suggestions')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', 'priority-key')
      .send({})
      .expect(400);
    expect(suggestionService.createBatch).not.toHaveBeenCalled();
  });

  it('AI timeout을 504 안전 오류로 반환한다', async () => {
    suggestionService.createBatch.mockRejectedValue(new TaskAiTimeoutError());
    const response = await request(app.getHttpServer())
      .post('/api/v1/task-priority-suggestions')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Idempotency-Key', 'priority-timeout-key')
      .send({ date: '2026-08-19' })
      .expect(504);
    expect(response.body.error.code).toBe('TASK_AI_TIMEOUT');
  });
});
