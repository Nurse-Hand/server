import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AiJobClaimLostError } from '../../ai-jobs/domain/ai-job.errors';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  CompleteTaskExtractionInput,
  ReserveTaskExtractionInput,
} from '../application/ports/task.repository';
import { TaskNotFoundError } from '../domain/task.errors';
import { PrismaTaskRepository } from './prisma-task.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const JOB_ID = '00000000-0000-4000-8000-000000000501';
const RECORD_ID = '00000000-0000-4000-8000-000000000601';
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000701';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000801';
const IDEMPOTENCY_RECORD_ID = '00000000-0000-4000-8000-000000000901';
const REQUEST_ID = '00000000-0000-4000-8000-000000001001';
const NOW = new Date('2026-08-19T00:00:00.000Z');
const DUTY_ENDS_AT = new Date('2026-08-19T08:00:00.000Z');
const WORK_DATE = new Date('2026-08-19T00:00:00.000Z');

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
  taskCreateReceipt: ModelMock;
  taskExtractionCandidate: ModelMock;
  taskExtractionCandidateEvidence: ModelMock;
  taskExtractionEvidence: ModelMock;
  taskExtractionJob: ModelMock;
  taskExtractionRequestReceipt: ModelMock;
  taskPriorityAudit: ModelMock;
};

type FakePrisma = FakeDatabaseClient & {
  $transaction: jest.Mock;
};

describe('PrismaTaskRepository extraction boundaries', () => {
  it('snapshot, receipt, Foundation record와 AiJob을 한 reservation transaction에 저장한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.nurseShift.findMany.mockResolvedValue([
      { endsAt: DUTY_ENDS_AT },
    ]);
    transaction.idempotencyRecord.create.mockResolvedValue({
      id: IDEMPOTENCY_RECORD_ID,
    });
    transaction.aiJob.create.mockResolvedValue({ id: JOB_ID });
    const repository = createRepository(prisma);
    const input = createReserveInput();

    await expect(repository.reserveExtraction(input)).resolves.toEqual({
      jobId: JOB_ID,
      status: 'QUEUED',
      isReplay: false,
    });

    expect(transaction.idempotencyRecord.create).toHaveBeenCalledWith({
      data: {
        ...CONTEXT,
        operation: 'tasks.extract',
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      },
      select: { id: true },
    });
    expect(transaction.aiJob.create).toHaveBeenCalledWith({
      data: {
        ...CONTEXT,
        operation: 'tasks.extract',
        idempotencyRecordId: IDEMPOTENCY_RECORD_ID,
        requestId: REQUEST_ID,
        maxAttempts: 3,
      },
      select: { id: true },
    });
    expect(transaction.taskExtractionJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: JOB_ID,
        ...CONTEXT,
        operation: 'tasks.extract',
        inputSnapshot: expect.objectContaining({
          requestedAt: NOW.toISOString(),
          currentDutyEndsAt: DUTY_ENDS_AT.toISOString(),
        }),
      }),
    });
    expect(transaction.taskExtractionEvidence.createMany).toHaveBeenCalledWith({
      data: [
        {
          datasetId: DATASET_ID,
          jobId: JOB_ID,
          roundingRecordId: RECORD_ID,
          sourceType: 'TIMELINE_EVENT',
          timelineEventId: RECORD_ID,
          sourceTaskId: null,
          patientId: PATIENT_ID,
          workDate: WORK_DATE,
          summary: 'Synthetic evidence',
        },
      ],
    });
    expect(
      transaction.taskExtractionRequestReceipt.create,
    ).toHaveBeenCalledWith({
      data: {
        ...CONTEXT,
        operation: 'tasks.extract',
        idempotencyRecordId: IDEMPOTENCY_RECORD_ID,
        jobId: JOB_ID,
      },
    });
  });

  it('PROCESSING reservation은 evidence 재저장 없이 공개 jobId를 replay한다', async () => {
    const { prisma } = createHarness();
    const input = createReserveInput();
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      id: IDEMPOTENCY_RECORD_ID,
      wardId: WARD_ID,
      requestHash: input.requestHash,
      status: 'PROCESSING',
      resultReference: null,
    });
    prisma.taskExtractionRequestReceipt.findFirst.mockResolvedValue({
      jobId: JOB_ID,
    });
    prisma.aiJob.findFirst.mockResolvedValue({ status: 'PROCESSING' });
    const repository = createRepository(prisma);

    await expect(
      repository.findExtractionReservationReplay({
        context: CONTEXT,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      }),
    ).resolves.toEqual({
      jobId: JOB_ID,
      status: 'PROCESSING',
      isReplay: true,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.taskExtractionEvidence.createMany).not.toHaveBeenCalled();
  });

  it('AI 제안과 근거 저장, lease fencing 성공, Foundation 완료를 한 transaction에서 처리한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.aiJob.findFirst.mockResolvedValue({
      idempotencyRecordId: IDEMPOTENCY_RECORD_ID,
    });
    transaction.taskExtractionJob.findFirst.mockResolvedValue({
      evidence: [storedEvidence()],
    });
    transaction.task.findMany.mockResolvedValue([]);
    transaction.taskExtractionCandidate.create.mockResolvedValue({
      id: CANDIDATE_ID,
    });
    transaction.aiJob.updateMany.mockResolvedValue({ count: 1 });
    transaction.idempotencyRecord.updateMany.mockResolvedValue({ count: 1 });
    const repository = createRepository(prisma);
    const input = createCompleteInput();

    await expect(repository.completeExtraction(input)).resolves.toBeUndefined();

    expect(transaction.aiJob.findFirst).toHaveBeenCalledWith({
      where: {
        id: JOB_ID,
        datasetId: DATASET_ID,
        actorId: ACTOR_ID,
        wardId: WARD_ID,
        operation: 'tasks.extract',
        status: 'PROCESSING',
        leaseVersion: 2,
        leaseExpiresAt: { gt: NOW },
      },
      select: { idempotencyRecordId: true },
    });
    expect(transaction.taskExtractionCandidate.create).toHaveBeenCalledWith({
      data: {
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        patientId: PATIENT_ID,
        title: '통증 재평가',
        description: null,
        dueAt: new Date('2026-08-19T01:00:00.000Z'),
        workDate: WORK_DATE,
        aiSuggestedPriority: 'HIGH',
        aiReasons: ['근무 종료 전 마감'],
        aiConfidence: 'MEDIUM',
        duplicateTaskId: null,
      },
      select: { id: true },
    });
    expect(
      transaction.taskExtractionCandidateEvidence.createMany,
    ).toHaveBeenCalledWith({
      data: [
        {
          datasetId: DATASET_ID,
          jobId: JOB_ID,
          candidateId: CANDIDATE_ID,
          evidenceId: EVIDENCE_ID,
        },
      ],
    });
    expect(transaction.aiJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: JOB_ID,
        datasetId: DATASET_ID,
        status: 'PROCESSING',
        leaseVersion: 2,
        leaseExpiresAt: { gt: NOW },
      },
      data: {
        status: 'SUCCEEDED',
        resultReference: JOB_ID,
        failureCode: null,
        retryable: null,
        version: { increment: 1 },
        updatedAt: NOW,
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
        resultReference: JOB_ID,
        updatedAt: NOW,
      },
    });
  });

  it('claim scope나 leaseVersion이 맞지 않으면 후보를 저장하기 전에 claim lost로 거부한다', async () => {
    const { prisma, transaction } = createHarness();
    transaction.aiJob.findFirst.mockResolvedValue(null);
    const repository = createRepository(prisma);

    await expect(
      repository.completeExtraction(createCompleteInput()),
    ).rejects.toBeInstanceOf(AiJobClaimLostError);

    expect(transaction.taskExtractionCandidate.create).not.toHaveBeenCalled();
    expect(transaction.aiJob.updateMany).not.toHaveBeenCalled();
  });

  it('job 조회가 demo scope를 고정하고 성공 후보의 categorical AI 제안과 근거를 반환한다', async () => {
    const { prisma } = createHarness();
    prisma.taskExtractionJob.findFirst.mockResolvedValue({
      candidates: [
        {
          id: CANDIDATE_ID,
          patientId: PATIENT_ID,
          title: '통증 재평가',
          description: null,
          dueAt: null,
          workDate: WORK_DATE,
          aiSuggestedPriority: 'HIGH',
          aiReasons: ['라운딩 후속 업무'],
          aiConfidence: 'MEDIUM',
          evidence: [{ evidence: storedEvidence() }],
          duplicateTaskId: null,
        },
      ],
    });
    prisma.aiJob.findFirst.mockResolvedValue({
      status: 'SUCCEEDED',
      failureCode: null,
      retryable: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const repository = createRepository(prisma);

    await expect(
      repository.findExtractionJob(CONTEXT, JOB_ID),
    ).resolves.toEqual({
      jobId: JOB_ID,
      status: 'SUCCEEDED',
      failureCode: null,
      retryable: null,
      candidates: [
        expect.objectContaining({
          id: CANDIDATE_ID,
          suggestedPriority: 'HIGH',
          reasons: ['라운딩 후속 업무'],
          confidence: 'MEDIUM',
          evidence: [{ sourceType: 'TIMELINE_EVENT', sourceId: RECORD_ID }],
        }),
      ],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(prisma.taskExtractionJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: JOB_ID,
          datasetId: DATASET_ID,
          actorId: ACTOR_ID,
          wardId: WARD_ID,
          operation: 'tasks.extract',
        },
      }),
    );
    expect(prisma.aiJob.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.taskExtractionJob.findFirst.mock.invocationCallOrder[0],
    );
  });

  it.each([
    {
      status: 'PROCESSING' as const,
      failureCode: null,
      retryable: null,
    },
    {
      status: 'FAILED' as const,
      failureCode: 'TASK_AI_TIMEOUT',
      retryable: true,
    },
  ])(
    '$status job은 AiJob 확인 후 feature 존재만 조회하고 후보를 노출하지 않는다',
    async ({ status, failureCode, retryable }) => {
      const { prisma } = createHarness();
      prisma.aiJob.findFirst.mockResolvedValue({
        status,
        failureCode,
        retryable,
        createdAt: NOW,
        updatedAt: NOW,
      });
      prisma.taskExtractionJob.findFirst.mockResolvedValue({ id: JOB_ID });
      const repository = createRepository(prisma);

      await expect(
        repository.findExtractionJob(CONTEXT, JOB_ID),
      ).resolves.toEqual({
        jobId: JOB_ID,
        status,
        failureCode,
        retryable,
        candidates: [],
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(prisma.taskExtractionJob.findFirst).toHaveBeenCalledWith({
        where: {
          id: JOB_ID,
          datasetId: DATASET_ID,
          actorId: ACTOR_ID,
          wardId: WARD_ID,
          operation: 'tasks.extract',
        },
        select: { id: true },
      });
      expect(prisma.aiJob.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.taskExtractionJob.findFirst.mock.invocationCallOrder[0],
      );
    },
  );

  it('다른 dataset 또는 ward의 job은 동일한 404로 숨긴다', async () => {
    const { prisma } = createHarness();
    const repository = createRepository(prisma);

    await expect(
      repository.findExtractionJob(
        {
          ...CONTEXT,
          datasetId: '00000000-0000-4000-8000-000000000102',
          wardId: '00000000-0000-4000-8000-000000000302',
        },
        JOB_ID,
      ),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
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

  return { prisma, transaction };
}

function createDatabaseClient(): FakeDatabaseClient {
  return {
    aiJob: createModelMock(),
    idempotencyRecord: createModelMock(),
    nurseShift: createModelMock(),
    patientAssignment: createModelMock(),
    task: createModelMock(),
    taskCreateReceipt: createModelMock(),
    taskExtractionCandidate: createModelMock(),
    taskExtractionCandidateEvidence: createModelMock(),
    taskExtractionEvidence: createModelMock(),
    taskExtractionJob: createModelMock(),
    taskExtractionRequestReceipt: createModelMock(),
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

function createReserveInput(): ReserveTaskExtractionInput {
  return {
    context: CONTEXT,
    idempotencyKey: 'task-extract-key',
    requestHash: 'a'.repeat(64),
    requestId: REQUEST_ID,
    maxAttempts: 3,
    evidenceSnapshot: {
      roundingSessionId: '00000000-0000-4000-8000-000000001101',
      evidence: [
        {
          recordId: RECORD_ID,
          sourceType: 'TIMELINE_EVENT',
          sourceId: RECORD_ID,
          patientId: PATIENT_ID,
          workDate: WORK_DATE,
          summary: 'Synthetic evidence',
        },
      ],
    },
    now: NOW,
  };
}

function createCompleteInput(): CompleteTaskExtractionInput {
  return {
    claim: {
      jobId: JOB_ID,
      datasetId: DATASET_ID,
      actorId: ACTOR_ID,
      wardId: WARD_ID,
      leaseVersion: 2,
    },
    candidates: [
      {
        candidateKey: 'candidate-a',
        patientId: PATIENT_ID,
        title: '통증 재평가',
        description: null,
        dueAt: new Date('2026-08-19T01:00:00.000Z'),
        workDate: WORK_DATE,
        suggestedPriority: 'HIGH',
        reasons: ['근무 종료 전 마감'],
        confidence: 'MEDIUM',
        evidenceSourceIds: [RECORD_ID],
      },
    ],
    now: NOW,
  };
}

function storedEvidence() {
  return {
    id: EVIDENCE_ID,
    sourceType: 'TIMELINE_EVENT' as const,
    timelineEventId: RECORD_ID,
    sourceTaskId: null,
  };
}
