import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import { IdempotencyKeyReusedError } from '../../../common/idempotency/idempotency.errors';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  CreateTaskInput,
  TaskView,
} from '../application/ports/task.repository';
import {
  TaskCandidateAlreadyAppliedError,
  TaskCompletedImmutableError,
  TaskCursorInvalidError,
  TaskNotFoundError,
} from '../domain/task.errors';
import { encodeTaskCursor } from '../domain/task-cursor';
import { getEffectiveTaskPriority } from '../domain/task-priority.policy';
import { PrismaTaskRepository } from './prisma-task.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const TASK_ID = '00000000-0000-4000-8000-000000000501';
const JOB_ID = '00000000-0000-4000-8000-000000000502';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000801';
const DUPLICATE_CANDIDATE_ID = '00000000-0000-4000-8000-000000000802';
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000901';
const IDEMPOTENCY_RECORD_ID = '00000000-0000-4000-8000-000000000601';
const NOW = new Date('2026-08-19T00:00:00.000Z');
const DUTY_ENDS_AT = new Date('2026-08-19T08:00:00.000Z');
const WORK_DATE = new Date('2026-08-19T00:00:00.000Z');
const REQUEST_HASH = 'a'.repeat(64);

const CONTEXT: DemoSessionContext = {
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
};

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

type ModelMock = {
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};

type FakeDatabaseClient = {
  aiJob: ModelMock;
  idempotencyRecord: ModelMock;
  nurseShift: ModelMock;
  patientAssignment: ModelMock;
  task: ModelMock;
  taskApplyReceipt: ModelMock;
  taskCreateReceipt: ModelMock;
  taskEvidence: ModelMock;
  taskExtractionCandidate: ModelMock;
  taskExtractionJob: ModelMock;
  taskPriorityAudit: ModelMock;
};

type FakePrisma = FakeDatabaseClient & {
  $transaction: jest.Mock;
};

describe('PrismaTaskRepository CRUD boundaries', () => {
  it.each([
    {
      label: '다른 dataset',
      context: {
        ...CONTEXT,
        datasetId: '00000000-0000-4000-8000-000000000102',
      },
    },
    {
      label: '다른 ward',
      context: { ...CONTEXT, wardId: '00000000-0000-4000-8000-000000000302' },
    },
    { label: '현재 간호사에게 미배정', context: CONTEXT },
  ])('$label 환자 필터를 동일한 404로 숨긴다', async ({ context }) => {
    const { prisma } = createHarness();
    prisma.nurseShift.findMany.mockResolvedValue([{ endsAt: DUTY_ENDS_AT }]);
    prisma.patientAssignment.findMany.mockResolvedValue([]);
    const repository = createRepository(prisma);

    await expect(
      repository.list({
        context,
        workDate: WORK_DATE,
        date: '2026-08-19',
        patientId: PATIENT_ID,
        sort: 'priority',
        limit: 20,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(TaskNotFoundError);

    expect(prisma.patientAssignment.findMany).toHaveBeenCalledWith({
      where: {
        datasetId: context.datasetId,
        wardId: context.wardId,
        nurseId: ACTOR_ID,
        startsAt: { lte: NOW },
        OR: [{ endsAt: null }, { endsAt: { gte: NOW } }],
        patientId: { in: [PATIENT_ID] },
      },
      distinct: ['patientId'],
      select: { patientId: true },
    });
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('미배정 환자의 직접 생성을 404로 거부하고 Task를 만들지 않는다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.patientAssignment.findMany.mockResolvedValue([]);
    const repository = createRepository(prisma);

    await expect(repository.create(createInput())).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );

    expect(transaction.task.create).not.toHaveBeenCalled();
    expect(transaction.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('완료된 같은 생성 요청은 저장된 응답 snapshot을 replay한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.idempotencyRecord.findUnique.mockResolvedValue(
      completedIdempotencyRecord(),
    );
    transaction.taskCreateReceipt.findFirst.mockResolvedValue({
      taskId: TASK_ID,
      responseSnapshot: serializeTaskView(createTaskView()),
    });
    const repository = createRepository(prisma);

    await expect(repository.create(createInput())).resolves.toEqual({
      task: createTaskView(),
      isReplay: true,
    });

    expect(transaction.task.create).not.toHaveBeenCalled();
    expect(transaction.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('같은 생성 key의 다른 request hash를 409 conflict로 거부한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.idempotencyRecord.findUnique.mockResolvedValue(
      completedIdempotencyRecord({ requestHash: 'b'.repeat(64) }),
    );
    const repository = createRepository(prisma);

    await expect(repository.create(createInput())).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
    expect(transaction.taskCreateReceipt.findFirst).not.toHaveBeenCalled();
  });

  it('동시 생성 unique 충돌 후 승자 receipt를 조회해 같은 Task를 replay한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.idempotencyRecord.findUnique.mockResolvedValue(null);
    transaction.patientAssignment.findMany.mockResolvedValue([
      { patientId: PATIENT_ID },
    ]);
    transaction.nurseShift.findMany.mockResolvedValue([
      { endsAt: DUTY_ENDS_AT },
    ]);
    transaction.idempotencyRecord.create.mockRejectedValue({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValue(
      completedIdempotencyRecord(),
    );
    prisma.taskCreateReceipt.findFirst.mockResolvedValue({
      taskId: TASK_ID,
      responseSnapshot: serializeTaskView(createTaskView()),
    });
    const repository = createRepository(prisma);

    await expect(repository.create(createInput())).resolves.toEqual({
      task: createTaskView(),
      isReplay: true,
    });

    expect(prisma.idempotencyRecord.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.taskCreateReceipt.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction.task.create).not.toHaveBeenCalled();
  });

  it('malformed cursor와 다른 filter의 cursor를 모두 400으로 거부한다', async () => {
    const { prisma } = createHarness();
    prisma.nurseShift.findMany.mockResolvedValue([{ endsAt: DUTY_ENDS_AT }]);
    prisma.patientAssignment.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([createTaskRow()]);
    const repository = createRepository(prisma);
    const baseInput = {
      context: CONTEXT,
      workDate: WORK_DATE,
      date: '2026-08-19',
      sort: 'priority' as const,
      limit: 20,
      now: NOW,
    };

    await expect(
      repository.list({ ...baseInput, cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(TaskCursorInvalidError);

    const cursor = encodeTaskCursor({
      filter: { date: '2026-08-19', sort: 'priority', status: 'TODO' },
      taskId: TASK_ID,
    });
    await expect(
      repository.list({ ...baseInput, cursor, status: 'IN_PROGRESS' }),
    ).rejects.toBeInstanceOf(TaskCursorInvalidError);
  });

  it('updateMany가 version 경쟁에서 0건이면 optimistic conflict로 처리한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.task.findFirst.mockResolvedValue(createTaskRow());
    transaction.nurseShift.findMany.mockResolvedValue([
      { endsAt: DUTY_ENDS_AT },
    ]);
    transaction.task.updateMany.mockResolvedValue({ count: 0 });
    const repository = createRepository(prisma);

    await expect(
      repository.update({
        context: CONTEXT,
        taskId: TASK_ID,
        expectedVersion: 1,
        title: '경쟁 후 수정',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    expect(transaction.task.findUnique).not.toHaveBeenCalled();
  });

  it('DONE 업무는 version이 일치해도 terminal 상태로 유지한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.task.findFirst.mockResolvedValue(
      createTaskRow({ status: 'DONE' }),
    );
    const repository = createRepository(prisma);

    await expect(
      repository.update({
        context: CONTEXT,
        taskId: TASK_ID,
        expectedVersion: 1,
        title: '변경 시도',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(TaskCompletedImmutableError);

    expect(transaction.nurseShift.findMany).not.toHaveBeenCalled();
    expect(transaction.task.updateMany).not.toHaveBeenCalled();
  });

  it('TaskQueryPort는 활성 배정 환자의 미완료 업무를 scope하고 안정 정렬한다', async () => {
    const { prisma } = createHarness();
    prisma.patientAssignment.findMany.mockResolvedValue([
      { patientId: PATIENT_ID },
    ]);
    prisma.nurseShift.findMany.mockResolvedValue([{ endsAt: DUTY_ENDS_AT }]);
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'b',
        patientId: PATIENT_ID,
        title: 'normal',
        dueAt: null,
        confirmedPriority: null,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
        evidence: [],
      },
      {
        id: 'a',
        patientId: PATIENT_ID,
        title: 'critical',
        dueAt: new Date('2026-08-18T23:59:59.000Z'),
        confirmedPriority: null,
        version: 2,
        createdAt: NOW,
        updatedAt: NOW,
        evidence: [
          {
            sourceType: 'TASK',
            timelineEventId: null,
            sourceTaskId: TASK_ID,
            roundingSegmentId: null,
          },
        ],
      },
    ]);
    const result = await createRepository(prisma).findIncompleteByPatients(
      CONTEXT,
      [PATIENT_ID, PATIENT_ID],
    );

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          datasetId: DATASET_ID,
          wardId: WARD_ID,
          actorId: ACTOR_ID,
          patientId: { in: [PATIENT_ID] },
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
      }),
    );
    expect(result.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(result[0].sourceReferences).toEqual([`TASK:${TASK_ID}`]);
  });

  it('apply 같은 key와 hash는 저장된 created/skipped 결과를 replay한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.idempotencyRecord.findUnique.mockResolvedValue({
      id: IDEMPOTENCY_RECORD_ID,
      wardId: WARD_ID,
      requestHash: REQUEST_HASH,
      status: 'COMPLETED',
      resultReference: 'receipt-id',
    });
    transaction.taskApplyReceipt.findFirst.mockResolvedValue({
      id: 'receipt-id',
      createdTaskIds: [TASK_ID],
      skippedCandidateIds: [],
    });
    const result = await createRepository(prisma).applyCandidates({
      context: CONTEXT,
      jobId: JOB_ID,
      idempotencyKey: 'apply-key',
      requestHash: REQUEST_HASH,
      items: [{ candidateId: '00000000-0000-4000-8000-000000000801' }],
      now: NOW,
    });
    expect(result).toEqual({
      createdTaskIds: [TASK_ID],
      skippedCandidateIds: [],
      isReplay: true,
    });
    expect(transaction.taskExtractionJob.findFirst).not.toHaveBeenCalled();
  });

  it('apply 같은 key와 다른 canonical hash는 409로 거부한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.idempotencyRecord.findUnique.mockResolvedValue({
      id: IDEMPOTENCY_RECORD_ID,
      wardId: WARD_ID,
      requestHash: 'b'.repeat(64),
      status: 'COMPLETED',
      resultReference: 'receipt-id',
    });

    await expect(
      createRepository(prisma).applyCandidates({
        context: CONTEXT,
        jobId: JOB_ID,
        idempotencyKey: 'apply-key',
        requestHash: REQUEST_HASH,
        items: [{ candidateId: CANDIDATE_ID }],
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.taskApplyReceipt.findFirst).not.toHaveBeenCalled();
    expect(transaction.taskExtractionJob.findFirst).not.toHaveBeenCalled();
  });

  it('createable 후보와 duplicate 후보를 한 transaction에서 저장·skip하고 완료한다', async () => {
    const { prisma, transaction } = createHarness();
    const dueAt = new Date('2026-08-18T23:30:00.000Z');
    transaction.taskExtractionJob.findFirst.mockResolvedValue({ id: JOB_ID });
    transaction.aiJob.findFirst.mockResolvedValue({ status: 'SUCCEEDED' });
    transaction.taskExtractionCandidate.findMany.mockResolvedValue([
      {
        id: CANDIDATE_ID,
        patientId: null,
        title: '후보 제목',
        description: '후보 설명',
        dueAt: null,
        workDate: WORK_DATE,
        aiSuggestedPriority: 'HIGH',
        aiReasons: ['근무 중 처리 필요'],
        aiConfidence: 'MEDIUM',
        duplicateTaskId: null,
        appliedAt: null,
        evidence: [
          {
            evidence: {
              sourceType: 'TIMELINE_EVENT',
              timelineEventId: EVIDENCE_ID,
              sourceTaskId: null,
            },
          },
        ],
      },
      {
        id: DUPLICATE_CANDIDATE_ID,
        patientId: null,
        duplicateTaskId: '00000000-0000-4000-8000-000000000599',
        appliedAt: null,
        evidence: [],
      },
    ]);
    transaction.nurseShift.findMany.mockResolvedValue([
      { endsAt: DUTY_ENDS_AT },
    ]);
    transaction.idempotencyRecord.create.mockResolvedValue({
      id: IDEMPOTENCY_RECORD_ID,
    });
    transaction.taskApplyReceipt.create.mockResolvedValue({ id: 'receipt-id' });
    transaction.task.create.mockResolvedValue({ id: TASK_ID });
    transaction.taskExtractionCandidate.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.idempotencyRecord.updateMany.mockResolvedValue({ count: 1 });

    const result = await createRepository(prisma).applyCandidates({
      context: CONTEXT,
      jobId: JOB_ID,
      idempotencyKey: 'apply-key',
      requestHash: REQUEST_HASH,
      items: [
        {
          candidateId: CANDIDATE_ID,
          title: '확정 제목',
          dueAt,
          priorityOverride: 'HIGH',
        },
        { candidateId: DUPLICATE_CANDIDATE_ID },
      ],
      now: NOW,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.task.create).toHaveBeenCalledWith({
      data: {
        ...CONTEXT,
        patientId: null,
        title: '확정 제목',
        description: '후보 설명',
        dueAt,
        workDate: WORK_DATE,
        source: 'AI_EXTRACTED',
        aiSuggestedPriority: 'HIGH',
        aiReasons: ['근무 중 처리 필요'],
        aiConfidence: 'MEDIUM',
        rulePriority: 'CRITICAL',
        confirmedPriority: 'HIGH',
      },
      select: { id: true },
    });
    const persistedTask = transaction.task.create.mock.calls[0][0].data;
    expect(
      getEffectiveTaskPriority(
        persistedTask.rulePriority,
        persistedTask.confirmedPriority,
      ),
    ).toBe('HIGH');
    expect(transaction.taskEvidence.createMany).toHaveBeenCalledWith({
      data: [
        {
          datasetId: DATASET_ID,
          taskId: TASK_ID,
          sourceType: 'TIMELINE_EVENT',
          timelineEventId: EVIDENCE_ID,
          sourceTaskId: null,
          roundingSegmentId: null,
        },
      ],
    });
    expect(transaction.taskPriorityAudit.create).toHaveBeenCalledWith({
      data: {
        datasetId: DATASET_ID,
        taskId: TASK_ID,
        actorId: ACTOR_ID,
        action: 'ACCEPT_AI',
        newConfirmedPriority: 'HIGH',
        aiSuggestedPriority: 'HIGH',
      },
    });
    expect(transaction.idempotencyRecord.create).toHaveBeenCalledWith({
      data: {
        ...CONTEXT,
        operation: 'tasks.extract.apply',
        idempotencyKey: 'apply-key',
        requestHash: REQUEST_HASH,
      },
      select: { id: true },
    });
    expect(transaction.taskApplyReceipt.create).toHaveBeenCalledWith({
      data: {
        ...CONTEXT,
        operation: 'tasks.extract.apply',
        jobId: JOB_ID,
        idempotencyRecordId: IDEMPOTENCY_RECORD_ID,
        createdTaskIds: [],
        skippedCandidateIds: [],
      },
      select: { id: true },
    });
    expect(
      transaction.taskExtractionCandidate.updateMany,
    ).toHaveBeenNthCalledWith(1, {
      where: { id: CANDIDATE_ID, datasetId: DATASET_ID, appliedAt: null },
      data: {
        appliedTaskId: TASK_ID,
        applyReceiptId: 'receipt-id',
        appliedByActorId: ACTOR_ID,
        appliedAt: NOW,
      },
    });
    expect(
      transaction.taskExtractionCandidate.updateMany,
    ).toHaveBeenNthCalledWith(2, {
      where: {
        id: DUPLICATE_CANDIDATE_ID,
        datasetId: DATASET_ID,
        appliedAt: null,
      },
      data: {
        applyReceiptId: 'receipt-id',
        appliedByActorId: ACTOR_ID,
        appliedAt: NOW,
      },
    });
    expect(transaction.taskApplyReceipt.update).toHaveBeenCalledWith({
      where: { id: 'receipt-id' },
      data: {
        createdTaskIds: [TASK_ID],
        skippedCandidateIds: [DUPLICATE_CANDIDATE_ID],
      },
    });
    expect(transaction.idempotencyRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: IDEMPOTENCY_RECORD_ID,
        datasetId: DATASET_ID,
        status: 'PROCESSING',
      },
      data: {
        status: 'COMPLETED',
        resultReference: 'receipt-id',
        updatedAt: NOW,
      },
    });
    expect(result).toEqual({
      createdTaskIds: [TASK_ID],
      skippedCandidateIds: [DUPLICATE_CANDIDATE_ID],
      isReplay: false,
    });
  });

  it('duplicate 후보는 Task 없이 조건부 mark하고 skipped receipt로 완료한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.taskExtractionJob.findFirst.mockResolvedValue({ id: JOB_ID });
    transaction.aiJob.findFirst.mockResolvedValue({ status: 'SUCCEEDED' });
    transaction.taskExtractionCandidate.findMany.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000801',
        patientId: null,
        duplicateTaskId: TASK_ID,
        appliedAt: null,
        evidence: [],
      },
    ]);
    transaction.idempotencyRecord.create.mockResolvedValue({
      id: IDEMPOTENCY_RECORD_ID,
    });
    transaction.taskApplyReceipt.create.mockResolvedValue({ id: 'receipt-id' });
    transaction.taskExtractionCandidate.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.idempotencyRecord.updateMany.mockResolvedValue({ count: 1 });
    const result = await createRepository(prisma).applyCandidates({
      context: CONTEXT,
      jobId: JOB_ID,
      idempotencyKey: 'apply-key',
      requestHash: REQUEST_HASH,
      items: [{ candidateId: '00000000-0000-4000-8000-000000000801' }],
      now: NOW,
    });
    expect(transaction.task.create).not.toHaveBeenCalled();
    expect(result.skippedCandidateIds).toEqual([
      '00000000-0000-4000-8000-000000000801',
    ]);
    expect(transaction.taskApplyReceipt.update).toHaveBeenCalled();
  });

  it('candidate conditional claim을 잃으면 transaction을 실패시킨다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.taskExtractionJob.findFirst.mockResolvedValue({ id: JOB_ID });
    transaction.aiJob.findFirst.mockResolvedValue({ status: 'SUCCEEDED' });
    transaction.taskExtractionCandidate.findMany.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000801',
        patientId: null,
        duplicateTaskId: TASK_ID,
        appliedAt: null,
        evidence: [],
      },
    ]);
    transaction.idempotencyRecord.create.mockResolvedValue({
      id: IDEMPOTENCY_RECORD_ID,
    });
    transaction.taskApplyReceipt.create.mockResolvedValue({ id: 'receipt-id' });
    transaction.taskExtractionCandidate.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(
      createRepository(prisma).applyCandidates({
        context: CONTEXT,
        jobId: JOB_ID,
        idempotencyKey: 'apply-key',
        requestHash: REQUEST_HASH,
        items: [{ candidateId: '00000000-0000-4000-8000-000000000801' }],
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(TaskCandidateAlreadyAppliedError);
  });
});

function createRepository(prisma: FakePrisma): PrismaTaskRepository {
  return new PrismaTaskRepository(
    prisma as unknown as PrismaService,
    new FixedClock(),
  );
}

function createHarness(): {
  prisma: FakePrisma;
  transaction: FakeDatabaseClient;
} {
  const transaction = createDatabaseClient();
  const prisma = {
    ...createDatabaseClient(),
    $transaction: jest.fn((callback: (client: FakeDatabaseClient) => unknown) =>
      callback(transaction),
    ),
  };

  transaction.idempotencyRecord.updateMany.mockResolvedValue({ count: 1 });
  transaction.task.updateMany.mockResolvedValue({ count: 1 });

  return { prisma, transaction };
}

function createDatabaseClient(): FakeDatabaseClient {
  return {
    aiJob: createModelMock(),
    idempotencyRecord: createModelMock(),
    nurseShift: createModelMock(),
    patientAssignment: createModelMock(),
    task: createModelMock(),
    taskApplyReceipt: createModelMock(),
    taskCreateReceipt: createModelMock(),
    taskEvidence: createModelMock(),
    taskExtractionCandidate: createModelMock(),
    taskExtractionJob: createModelMock(),
    taskPriorityAudit: createModelMock(),
  };
}

function createModelMock(): ModelMock {
  return {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
}

function createInput(): CreateTaskInput {
  return {
    context: CONTEXT,
    idempotencyKey: 'task-create-key',
    requestHash: REQUEST_HASH,
    patientId: PATIENT_ID,
    title: '통증 재평가',
    description: null,
    dueAt: new Date('2026-08-19T01:00:00.000Z'),
    workDate: WORK_DATE,
    confirmedPriority: null,
    now: NOW,
  };
}

function completedIdempotencyRecord(
  overrides: Partial<{
    requestHash: string;
  }> = {},
) {
  return {
    id: IDEMPOTENCY_RECORD_ID,
    wardId: WARD_ID,
    requestHash: overrides.requestHash ?? REQUEST_HASH,
    status: 'COMPLETED' as const,
    resultReference: TASK_ID,
  };
}

function createTaskRow(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: TASK_ID,
    patientId: null,
    title: '통증 재평가',
    description: null,
    dueAt: new Date('2026-08-19T01:00:00.000Z'),
    workDate: WORK_DATE,
    status: 'TODO',
    source: 'MANUAL',
    aiSuggestedPriority: null,
    aiReasons: [],
    aiConfidence: null,
    rulePriority: 'HIGH',
    confirmedPriority: null,
    effectivePriority: 'HIGH',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createTaskView(overrides: Partial<TaskView> = {}): TaskView {
  return createTaskRow(overrides);
}

function serializeTaskView(task: TaskView): Record<string, unknown> {
  return {
    ...task,
    dueAt: task.dueAt?.toISOString() ?? null,
    workDate: task.workDate.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
