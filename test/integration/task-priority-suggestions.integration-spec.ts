import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TASK_PRIORITY_SUGGESTION_GATEWAY } from '../../src/modules/tasks/application/ports/task-priority-suggestion.gateway';
import type { TaskPrioritySuggestionGateway } from '../../src/modules/tasks/application/ports/task-priority-suggestion.gateway';
import {
  TASK_PRIORITY_SUGGESTION_REPOSITORY,
  type TaskPrioritySuggestionRepository,
} from '../../src/modules/tasks/application/ports/task-priority-suggestion.repository';
import { TaskAiTimeoutError } from '../../src/modules/tasks/domain/task.errors';
import {
  deriveSeoulWorkDate,
  formatTaskWorkDate,
} from '../../src/modules/tasks/domain/task-work-date';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionService } from '../../src/modules/demo/application/demo-session.service';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import { createPublicOpenApiDocument } from '../../src/openapi/create-public-openapi-document';

type SessionIds = {
  sender: string;
  receiver: string;
};

describe('Task priority suggestions PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: jest.Mocked<TaskPrioritySuggestionGateway>;
  let repository: TaskPrioritySuggestionRepository;
  let context: DemoSessionContext;
  let secondDatasetContext: DemoSessionContext;
  let sessionId: string;
  let receiverSessionId: string;
  let secondDatasetSessionId: string;
  let workDate: Date;
  let date: string;
  let patientId: string;

  beforeAll(async () => {
    gateway = { prioritize: jest.fn() };
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TASK_PRIORITY_SUGGESTION_GATEWAY)
      .useValue(gateway)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    repository = app.get<TaskPrioritySuggestionRepository>(
      TASK_PRIORITY_SUGGESTION_REPOSITORY,
    );
    const sessionService = app.get(DemoSessionService);
    const resolver = app.get(DemoSessionContextResolver);
    const sessions = readSessionIds(
      await sessionService.create('SYNTHETIC_MEDICAL_DAY_SHIFT'),
    );
    sessionId = sessions.sender;
    receiverSessionId = sessions.receiver;
    context = await resolver.resolve(sessionId);
    const secondDatasetSessions = readSessionIds(
      await sessionService.create('SYNTHETIC_MEDICAL_DAY_SHIFT'),
    );
    secondDatasetSessionId = secondDatasetSessions.sender;
    secondDatasetContext = await resolver.resolve(secondDatasetSessionId);
    const assignment = await prisma.patientAssignment.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        wardId: context.wardId,
        nurseId: context.actorId,
      },
      select: { patientId: true },
    });
    patientId = assignment.patientId;
    workDate = deriveSeoulWorkDate(new Date());
    date = formatTaskWorkDate(workDate);
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    gateway.prioritize.mockReset();
    gateway.prioritize.mockImplementation((input) =>
      Promise.resolve({
        requestId: input.requestId,
        suggestions: input.tasks.map(({ taskId }) => ({
          taskId,
          aiScore: 10,
          aiSuggestedPriority: 'CRITICAL',
          reasons: ['Synthetic priority suggestion'],
        })),
      }),
    );
  });

  it('AppModule OpenAPI에 명시적 batch POST와 PATCH suggestionId를 등록한다', () => {
    const document = createPublicOpenApiDocument(app);
    expect(
      document.paths['/api/v1/task-priority-suggestions']?.post,
    ).toBeDefined();
    const patchRequestBody =
      document.paths['/api/v1/tasks/{taskId}']?.patch?.requestBody;
    expect(patchRequestBody).toBeDefined();
    if (!patchRequestBody || '$ref' in patchRequestBody) {
      throw new Error('PATCH requestBody를 확인할 수 없습니다.');
    }

    const patchSchema = patchRequestBody.content['application/json']?.schema;
    expect(patchSchema).toBeDefined();
    if (!patchSchema || !('$ref' in patchSchema)) {
      throw new Error('PATCH request schema의 local $ref가 없습니다.');
    }

    const schemaPrefix = '#/components/schemas/';
    expect(patchSchema.$ref.startsWith(schemaPrefix)).toBe(true);
    const componentName = patchSchema.$ref.slice(schemaPrefix.length);
    const componentSchema = document.components?.schemas?.[componentName];
    expect(componentSchema).toBeDefined();
    if (!componentSchema || '$ref' in componentSchema) {
      throw new Error('PATCH request schema component를 확인할 수 없습니다.');
    }

    expect(componentSchema.properties?.prioritySuggestionId).toMatchObject({
      type: 'string',
      format: 'uuid',
    });
    expect(componentSchema.required ?? []).not.toContain(
      'prioritySuggestionId',
    );
  });

  it('성공 snapshot을 저장하고 같은 key·snapshot 및 requestId 재사용을 안전하게 처리한다', async () => {
    const task = await createTask('success');
    const key = keyFor('success');
    const requestId = randomUUID();

    const first = await postBatch(key, requestId).expect(201);
    const replay = await postBatch(key, randomUUID()).expect(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(gateway.prioritize).toHaveBeenCalledTimes(1);
    expect(
      first.body.data.suggestions.find(
        (suggestion: { taskId: string }) => suggestion.taskId === task.id,
      ),
    ).toMatchObject({
      taskId: task.id,
      aiScore: 10,
      aiSuggestedPriority: 'CRITICAL',
    });

    await postBatch(keyFor('same-request-id'), requestId).expect(201);
    expect(gateway.prioritize).toHaveBeenCalledTimes(2);
    await expect(
      prisma.taskPrioritySuggestionBatch.count({
        where: { datasetId: context.datasetId, requestId },
      }),
    ).resolves.toBe(2);
  });

  it('실패 snapshot을 같은 key에서 504로 replay하고 새 key에서만 재시도한다', async () => {
    await createTask('failure');
    gateway.prioritize.mockRejectedValueOnce(new TaskAiTimeoutError());
    const key = keyFor('failure');

    const first = await postBatch(key).expect(504);
    const replay = await postBatch(key).expect(504);
    expect(first.body.error.code).toBe('TASK_AI_TIMEOUT');
    expect(replay.body.error).toEqual(first.body.error);
    expect(gateway.prioritize).toHaveBeenCalledTimes(1);

    await postBatch(keyFor('failure-retry')).expect(201);
    expect(gateway.prioritize).toHaveBeenCalledTimes(2);
  });

  it('같은 key의 다른 snapshot은 409이고 진행 중 동시 요청은 AI를 중복 호출하지 않는다', async () => {
    const task = await createTask('key-reuse');
    const key = keyFor('key-reuse');
    await postBatch(key).expect(201);
    await prisma.task.update({
      where: { id: task.id },
      data: { title: 'Changed snapshot', version: { increment: 1 } },
    });
    const reused = await postBatch(key).expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    await createTask('concurrent');
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    gateway.prioritize.mockImplementationOnce(async (input) => {
      started?.();
      await blocked;
      return {
        requestId: input.requestId,
        suggestions: input.tasks.map(({ taskId }) => ({
          taskId,
          aiScore: 1,
          aiSuggestedPriority: 'NORMAL',
          reasons: [],
        })),
      };
    });
    const concurrentKey = keyFor('concurrent');
    const firstRequest = postBatch(concurrentKey)
      .expect(201)
      .then((response) => response);
    await startedPromise;
    try {
      const second = await postBatch(concurrentKey).expect(409);
      expect(second.body.error.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
    } finally {
      release?.();
    }
    await firstRequest;
  });

  it('DB unique 경쟁에서 같은 hash는 진행 중, 다른 hash는 key 재사용으로 판정한다', async () => {
    const baseInput = {
      context,
      workDate,
      idempotencyKey: keyFor('repository-race-same'),
      requestHash: 'a'.repeat(64),
      requestId: randomUUID(),
      inputSnapshot: [],
      now: new Date(),
    };
    const sameHash = await Promise.allSettled([
      repository.reserve(baseInput),
      repository.reserve({ ...baseInput, requestId: randomUUID() }),
    ]);
    expect(
      sameHash.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(sameHash.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' },
    });

    const differentKey = keyFor('repository-race-different');
    const differentHash = await Promise.allSettled([
      repository.reserve({
        ...baseInput,
        idempotencyKey: differentKey,
        requestHash: 'b'.repeat(64),
        requestId: randomUUID(),
      }),
      repository.reserve({
        ...baseInput,
        idempotencyKey: differentKey,
        requestHash: 'c'.repeat(64),
        requestId: randomUUID(),
      }),
    ]);
    expect(
      differentHash.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      differentHash.find(({ status }) => status === 'rejected'),
    ).toMatchObject({
      reason: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('유효한 suggestion만 ACCEPT_AI로 감사하고 stale·cross-task 변조를 거부한다', async () => {
    const firstTask = await createTask('accept');
    const secondTask = await createTask('cross-task');
    const batch = await postBatch(keyFor('accept')).expect(201);
    const suggestions = batch.body.data.suggestions as Array<{
      suggestionId: string;
      taskId: string;
    }>;
    const firstSuggestion = suggestions.find(
      ({ taskId }) => taskId === firstTask.id,
    );
    const secondSuggestion = suggestions.find(
      ({ taskId }) => taskId === secondTask.id,
    );
    expect(firstSuggestion).toBeDefined();
    expect(secondSuggestion).toBeDefined();
    if (!firstSuggestion || !secondSuggestion) {
      throw new Error('수락 검증에 필요한 AI 제안이 없습니다.');
    }

    await patchPriority(
      firstTask.id,
      firstTask.version,
      firstSuggestion.suggestionId,
    ).expect(200);
    const audit = await prisma.taskPriorityAudit.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        taskId: firstTask.id,
        prioritySuggestionId: firstSuggestion.suggestionId,
      },
    });
    expect(audit.action).toBe('ACCEPT_AI');

    const crossTask = await patchPriority(
      secondTask.id,
      secondTask.version,
      firstSuggestion.suggestionId,
    ).expect(404);
    expect(crossTask.body.error.code).toBe('TASK_NOT_FOUND');

    await prisma.task.update({
      where: { id: secondTask.id },
      data: { title: 'Changed after suggestion', version: { increment: 1 } },
    });
    const stale = await patchPriority(
      secondTask.id,
      secondTask.version + 1,
      secondSuggestion.suggestionId,
    ).expect(422);
    expect(stale.body.error.code).toBe(
      'TASK_PRIORITY_SUGGESTION_ACCEPTANCE_INVALID',
    );
  });

  it('우선순위 불일치·scope 변조를 거부하고 같은 값의 명시적 수락도 감사한다', async () => {
    const mismatchTask = await createTask('priority-mismatch');
    const noOpTask = await createTask('no-op', 'CRITICAL');
    const batch = await postBatch(keyFor('acceptance-policy')).expect(201);
    const suggestions = batch.body.data.suggestions as Array<{
      suggestionId: string;
      taskId: string;
    }>;
    const mismatchSuggestion = suggestions.find(
      ({ taskId }) => taskId === mismatchTask.id,
    );
    const noOpSuggestion = suggestions.find(
      ({ taskId }) => taskId === noOpTask.id,
    );
    if (!mismatchSuggestion || !noOpSuggestion) {
      throw new Error('정책 검증에 필요한 AI 제안이 없습니다.');
    }

    const mismatch = await patchPriority(
      mismatchTask.id,
      mismatchTask.version,
      mismatchSuggestion.suggestionId,
      'NORMAL',
    ).expect(422);
    expect(mismatch.body.error.code).toBe(
      'TASK_PRIORITY_SUGGESTION_ACCEPTANCE_INVALID',
    );

    await patchPriority(
      noOpTask.id,
      noOpTask.version,
      noOpSuggestion.suggestionId,
    ).expect(200);
    await expect(
      prisma.taskPriorityAudit.count({
        where: {
          datasetId: context.datasetId,
          taskId: noOpTask.id,
          prioritySuggestionId: noOpSuggestion.suggestionId,
          action: 'ACCEPT_AI',
        },
      }),
    ).resolves.toBe(1);

    await patchPriorityWithSession(
      receiverSessionId,
      mismatchTask.id,
      mismatchTask.version,
      mismatchSuggestion.suggestionId,
    ).expect(404);
    await patchPriorityWithSession(
      secondDatasetSessionId,
      mismatchTask.id,
      mismatchTask.version,
      mismatchSuggestion.suggestionId,
    ).expect(404);
  });

  it('DB composite FK와 score CHECK가 cross-scope 및 비유한 점수를 차단한다', async () => {
    const task = await createTask('db-constraints');
    const batchResponse = await postBatch(keyFor('db-constraints')).expect(201);
    const batchId = batchResponse.body.data.batchId as string;

    const baseSuggestion = {
      datasetId: context.datasetId,
      batchId,
      taskId: task.id,
      taskVersion: task.version,
      actorId: context.actorId,
      wardId: context.wardId,
      aiScore: 1,
      aiSuggestedPriority: 'NORMAL' as const,
      reasons: [],
    };
    await expect(
      prisma.taskPrioritySuggestion.create({
        data: { ...baseSuggestion, actorId: randomUUID() },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.taskPrioritySuggestion.create({
        data: { ...baseSuggestion, wardId: randomUUID() },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.taskPrioritySuggestion.create({
        data: {
          ...baseSuggestion,
          datasetId: secondDatasetContext.datasetId,
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "TaskPrioritySuggestion" SET "aiScore" = 'NaN'::DOUBLE PRECISION WHERE "batchId" = $1::uuid`,
        batchId,
      ),
    ).rejects.toBeDefined();
  });

  async function createTask(
    label: string,
    confirmedPriority: 'CRITICAL' | 'HIGH' | 'NORMAL' | null = null,
  ) {
    return prisma.task.create({
      data: {
        ...context,
        patientId,
        title: `Synthetic ${label} ${randomUUID()}`,
        dueAt: new Date(Date.now() + 60 * 60 * 1000),
        workDate,
        source: 'MANUAL',
        aiReasons: [],
        rulePriority: 'NORMAL',
        confirmedPriority,
      },
    });
  }

  function postBatch(key: string, requestId = randomUUID()) {
    return request(app.getHttpServer())
      .post('/api/v1/task-priority-suggestions')
      .set('X-Demo-Session-Id', sessionId)
      .set('X-Idempotency-Key', key)
      .set('X-Request-Id', requestId)
      .send({ date });
  }

  function patchPriority(
    taskId: string,
    version: number,
    prioritySuggestionId: string,
    priorityOverride: 'CRITICAL' | 'HIGH' | 'NORMAL' = 'CRITICAL',
  ) {
    return patchPriorityWithSession(
      sessionId,
      taskId,
      version,
      prioritySuggestionId,
      priorityOverride,
    );
  }

  function patchPriorityWithSession(
    targetSessionId: string,
    taskId: string,
    version: number,
    prioritySuggestionId: string,
    priorityOverride: 'CRITICAL' | 'HIGH' | 'NORMAL' = 'CRITICAL',
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('X-Demo-Session-Id', targetSessionId)
      .send({
        version,
        priorityOverride,
        prioritySuggestionId,
      });
  }
});

function keyFor(label: string): string {
  return `priority-${label}-${randomUUID()}`;
}

function readSessionIds(
  created: Awaited<ReturnType<DemoSessionService['create']>>,
): SessionIds {
  const sender = created.sessions.find(({ persona }) => persona === 'SENDER');
  const receiver = created.sessions.find(
    ({ persona }) => persona === 'RECEIVER',
  );
  if (!sender || !receiver) {
    throw new Error('SENDER와 RECEIVER demo session이 필요합니다.');
  }
  return { sender: sender.sessionId, receiver: receiver.sessionId };
}
