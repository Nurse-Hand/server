import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
  IdempotencyRequestInProgressError,
} from '../../../common/idempotency/idempotency.errors';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AiJobClaimLostError } from '../../ai-jobs/domain/ai-job.errors';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  TaskQueryContext,
  TaskQueryPort,
  TaskReadModel,
} from '../application/ports/task-query.port';
import type {
  ApplyTaskCandidatesInput,
  ApplyTaskCandidatesResult,
  CompleteTaskExtractionInput,
  CreateTaskInput,
  CreateTaskResult,
  ListTasksInput,
  ListTasksResult,
  ReserveTaskExtractionInput,
  ReserveTaskExtractionResult,
  TaskExtractionJobView,
  TaskExtractionWorkItem,
  TaskRepository,
  TaskView,
  UpdateTaskInput,
} from '../application/ports/task.repository';
import {
  TaskCandidateAlreadyAppliedError,
  TaskCompletedImmutableError,
  TaskCurrentDutyUnresolvedError,
  TaskCursorInvalidError,
  TaskNotFoundError,
  TaskPersistenceInvariantError,
  TaskExtractionNotSucceededError,
} from '../domain/task.errors';
import {
  calculateTaskRulePriority,
  compareTaskOrdering,
  getEffectiveTaskPriority,
} from '../domain/task-priority.policy';
import { decodeTaskCursor, encodeTaskCursor } from '../domain/task-cursor';
import {
  TASK_APPLY_OPERATION,
  TASK_CREATE_OPERATION,
  TASK_EXTRACTION_OPERATION,
  type TaskAiConfidence,
  type TaskEvidenceSourceType,
  type TaskPriority,
} from '../domain/task.types';
import { deriveSeoulWorkDate } from '../domain/task-work-date';

const TASK_SELECT = {
  id: true,
  patientId: true,
  title: true,
  description: true,
  dueAt: true,
  workDate: true,
  status: true,
  source: true,
  aiSuggestedPriority: true,
  aiReasons: true,
  aiConfidence: true,
  rulePriority: true,
  confirmedPriority: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;
type DatabaseClient = Prisma.TransactionClient | PrismaService;

type IdempotencyRow = {
  id: string;
  wardId: string;
  requestHash: string;
  status: 'PROCESSING' | 'COMPLETED';
  resultReference: string | null;
};

@Injectable()
export class PrismaTaskRepository implements TaskRepository, TaskQueryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(input: ListTasksInput): Promise<ListTasksResult> {
    const currentDutyEndsAt = await this.resolveCurrentDutyEndsAt(
      this.prisma,
      input.context,
      input.now,
    );
    const accessiblePatientIds = await this.findAccessiblePatientIds(
      this.prisma,
      input.context,
      input.now,
      input.patientId === undefined ? undefined : [input.patientId],
    );

    if (
      input.patientId !== undefined &&
      !accessiblePatientIds.includes(input.patientId)
    ) {
      throw new TaskNotFoundError();
    }

    const rows = await this.prisma.task.findMany({
      where: {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        actorId: input.context.actorId,
        workDate: input.workDate,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.patientId === undefined
          ? {
              OR: [
                { patientId: null },
                { patientId: { in: accessiblePatientIds } },
              ],
            }
          : { patientId: input.patientId }),
      },
      select: TASK_SELECT,
    });
    const ordered = rows
      .map((row) => this.toTaskView(row, input.now, currentDutyEndsAt))
      .sort((left, right) => compareTaskOrdering(left, right, input.sort));
    const filter = {
      date: input.date,
      sort: input.sort,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.patientId === undefined ? {} : { patientId: input.patientId }),
    };
    let startIndex = 0;

    if (input.cursor !== undefined) {
      const cursor = decodeTaskCursor(input.cursor, filter);
      const cursorIndex = ordered.findIndex(({ id }) => id === cursor.taskId);

      if (cursorIndex < 0) {
        throw new TaskCursorInvalidError();
      }

      startIndex = cursorIndex + 1;
    }

    const items = ordered.slice(startIndex, startIndex + input.limit);
    const hasNext = startIndex + items.length < ordered.length;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasNext && last ? encodeTaskCursor({ filter, taskId: last.id }) : null,
    };
  }

  async create(input: CreateTaskInput): Promise<CreateTaskResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findIdempotencyRecord(
          transaction,
          input.context,
          TASK_CREATE_OPERATION,
          input.idempotencyKey,
        );

        if (existing) {
          return this.resolveCreateReplay(transaction, input, existing);
        }

        await this.assertPatientsAccessible(
          transaction,
          input.context,
          input.now,
          input.patientId === null ? [] : [input.patientId],
        );
        const currentDutyEndsAt = await this.resolveCurrentDutyEndsAt(
          transaction,
          input.context,
          input.now,
        );
        const rulePriority = calculateTaskRulePriority({
          dueAt: input.dueAt,
          now: input.now,
          currentDutyEndsAt,
        });
        const record = await transaction.idempotencyRecord.create({
          data: {
            ...input.context,
            actorId: input.context.actorId,
            operation: TASK_CREATE_OPERATION,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          },
          select: { id: true },
        });
        const created = await transaction.task.create({
          data: {
            ...input.context,
            patientId: input.patientId,
            title: input.title,
            description: input.description,
            dueAt: input.dueAt,
            workDate: input.workDate,
            source: 'MANUAL',
            aiReasons: [],
            rulePriority,
            confirmedPriority: input.confirmedPriority,
          },
          select: TASK_SELECT,
        });

        if (input.confirmedPriority !== null) {
          await transaction.taskPriorityAudit.create({
            data: {
              datasetId: input.context.datasetId,
              taskId: created.id,
              actorId: input.context.actorId,
              action: 'MANUAL_SET',
              newConfirmedPriority: input.confirmedPriority,
            },
          });
        }

        const task = this.toTaskView(created, input.now, currentDutyEndsAt);
        await transaction.taskCreateReceipt.create({
          data: {
            ...input.context,
            operation: TASK_CREATE_OPERATION,
            idempotencyRecordId: record.id,
            taskId: task.id,
            responseSnapshot: serializeTaskView(task),
          },
        });
        const completed = await transaction.idempotencyRecord.updateMany({
          where: {
            id: record.id,
            datasetId: input.context.datasetId,
            status: 'PROCESSING',
          },
          data: {
            status: 'COMPLETED',
            resultReference: task.id,
            updatedAt: input.now,
          },
        });

        if (completed.count !== 1) {
          throw new TaskPersistenceInvariantError();
        }

        return { task, isReplay: false };
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2003')) {
        throw new TaskNotFoundError();
      }

      if (!hasPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const existing = await this.findIdempotencyRecord(
        this.prisma,
        input.context,
        TASK_CREATE_OPERATION,
        input.idempotencyKey,
      );

      if (!existing) {
        throw error;
      }

      return this.resolveCreateReplay(this.prisma, input, existing);
    }
  }

  async update(input: UpdateTaskInput): Promise<TaskView> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.task.findFirst({
        where: {
          id: input.taskId,
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          actorId: input.context.actorId,
        },
        select: TASK_SELECT,
      });

      if (!current) {
        throw new TaskNotFoundError();
      }

      await this.assertPatientsAccessible(
        transaction,
        input.context,
        input.now,
        current.patientId === null ? [] : [current.patientId],
      );

      if (current.version !== input.expectedVersion) {
        throw new VersionConflictError(input.expectedVersion, current.version);
      }

      if (current.status === 'DONE') {
        throw new TaskCompletedImmutableError();
      }

      const currentDutyEndsAt = await this.resolveCurrentDutyEndsAt(
        transaction,
        input.context,
        input.now,
      );
      const dueAt = input.dueAt ?? current.dueAt;
      const rulePriority = calculateTaskRulePriority({
        dueAt,
        now: input.now,
        currentDutyEndsAt,
      });
      const priorityChanged =
        input.confirmedPriority !== undefined &&
        input.confirmedPriority !== current.confirmedPriority;
      const updated = await transaction.task.updateMany({
        where: {
          id: current.id,
          datasetId: input.context.datasetId,
          version: input.expectedVersion,
        },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.dueAt === undefined
            ? {}
            : { dueAt: input.dueAt, workDate: input.workDate }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.confirmedPriority === undefined
            ? {}
            : { confirmedPriority: input.confirmedPriority }),
          rulePriority,
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });

      if (updated.count !== 1) {
        throw new VersionConflictError(input.expectedVersion);
      }

      if (priorityChanged) {
        await transaction.taskPriorityAudit.create({
          data: {
            datasetId: input.context.datasetId,
            taskId: current.id,
            actorId: input.context.actorId,
            action:
              input.confirmedPriority === null
                ? 'CLEARED'
                : input.confirmedPriority === current.aiSuggestedPriority
                  ? 'ACCEPT_AI'
                  : 'MANUAL_SET',
            previousConfirmedPriority: current.confirmedPriority,
            newConfirmedPriority: input.confirmedPriority,
            aiSuggestedPriority: current.aiSuggestedPriority,
          },
        });
      }

      const result = await transaction.task.findUnique({
        where: { id: current.id },
        select: TASK_SELECT,
      });

      if (!result) {
        throw new TaskPersistenceInvariantError();
      }

      return this.toTaskView(result, input.now, currentDutyEndsAt);
    });
  }

  async reserveExtraction(
    input: ReserveTaskExtractionInput,
  ): Promise<ReserveTaskExtractionResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findIdempotencyRecord(
          transaction,
          input.context,
          TASK_EXTRACTION_OPERATION,
          input.idempotencyKey,
        );

        if (existing) {
          return this.resolveExtractionReplay(transaction, input, existing);
        }

        const currentDutyEndsAt = await this.resolveCurrentDutyEndsAt(
          transaction,
          input.context,
          input.now,
        );
        const record = await transaction.idempotencyRecord.create({
          data: {
            ...input.context,
            operation: TASK_EXTRACTION_OPERATION,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          },
          select: { id: true },
        });
        const aiJob = await transaction.aiJob.create({
          data: {
            ...input.context,
            operation: TASK_EXTRACTION_OPERATION,
            idempotencyRecordId: record.id,
            requestId: input.requestId,
            maxAttempts: input.maxAttempts,
          },
          select: { id: true },
        });
        await transaction.taskExtractionJob.create({
          data: {
            id: aiJob.id,
            ...input.context,
            operation: TASK_EXTRACTION_OPERATION,
            roundingSessionId: input.evidenceSnapshot.roundingSessionId,
            inputSnapshot: {
              requestedAt: input.now.toISOString(),
              currentDutyEndsAt: currentDutyEndsAt.toISOString(),
              roundingSessionId: input.evidenceSnapshot.roundingSessionId,
              evidence: input.evidenceSnapshot.evidence.map((evidence) => ({
                recordId: evidence.recordId,
                sourceType: evidence.sourceType,
                sourceId: evidence.sourceId,
                patientId: evidence.patientId,
                workDate: evidence.workDate.toISOString().slice(0, 10),
              })),
            },
          },
        });
        await transaction.taskExtractionEvidence.createMany({
          data: input.evidenceSnapshot.evidence.map((evidence) => ({
            datasetId: input.context.datasetId,
            jobId: aiJob.id,
            roundingRecordId: evidence.recordId,
            ...toStoredEvidenceColumns(evidence),
            patientId: evidence.patientId,
            workDate: evidence.workDate,
            summary: evidence.summary,
          })),
        });
        await transaction.taskExtractionRequestReceipt.create({
          data: {
            ...input.context,
            operation: TASK_EXTRACTION_OPERATION,
            idempotencyRecordId: record.id,
            jobId: aiJob.id,
          },
        });

        return { jobId: aiJob.id, status: 'QUEUED', isReplay: false };
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2003')) {
        throw new TaskNotFoundError();
      }

      if (!hasPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const existing = await this.findIdempotencyRecord(
        this.prisma,
        input.context,
        TASK_EXTRACTION_OPERATION,
        input.idempotencyKey,
      );

      if (!existing) {
        throw error;
      }

      return this.resolveExtractionReplay(this.prisma, input, existing);
    }
  }

  async findExtractionReservationReplay(input: {
    context: DemoSessionContext;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<ReserveTaskExtractionResult | null> {
    const existing = await this.findIdempotencyRecord(
      this.prisma,
      input.context,
      TASK_EXTRACTION_OPERATION,
      input.idempotencyKey,
    );

    if (!existing) {
      return null;
    }

    return this.resolveExtractionReplay(this.prisma, input, existing);
  }

  async findExtractionWorkItem(
    datasetId: string,
    jobId: string,
  ): Promise<TaskExtractionWorkItem> {
    const [job, aiJob] = await Promise.all([
      this.prisma.taskExtractionJob.findFirst({
        where: { id: jobId, datasetId, operation: TASK_EXTRACTION_OPERATION },
        include: {
          evidence: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              roundingRecordId: true,
              sourceType: true,
              timelineEventId: true,
              sourceTaskId: true,
              patientId: true,
              workDate: true,
              summary: true,
            },
          },
        },
      }),
      this.prisma.aiJob.findFirst({
        where: {
          id: jobId,
          datasetId,
          operation: TASK_EXTRACTION_OPERATION,
        },
        select: {
          actorId: true,
          wardId: true,
          requestId: true,
        },
      }),
    ]);

    if (
      !job ||
      !aiJob ||
      job.actorId !== aiJob.actorId ||
      job.wardId !== aiJob.wardId
    ) {
      throw new TaskPersistenceInvariantError();
    }

    return {
      jobId: job.id,
      datasetId: job.datasetId,
      actorId: job.actorId,
      wardId: job.wardId,
      requestId: aiJob.requestId,
      evidence: job.evidence.map(
        ({
          roundingRecordId,
          sourceType,
          timelineEventId,
          sourceTaskId,
          ...evidence
        }) => ({
          ...evidence,
          recordId: roundingRecordId,
          ...readStoredEvidenceReference({
            sourceType,
            timelineEventId,
            sourceTaskId,
          }),
        }),
      ),
    };
  }

  async completeExtraction(input: CompleteTaskExtractionInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const aiJob = await transaction.aiJob.findFirst({
        where: {
          id: input.claim.jobId,
          datasetId: input.claim.datasetId,
          actorId: input.claim.actorId,
          wardId: input.claim.wardId,
          operation: TASK_EXTRACTION_OPERATION,
          status: 'PROCESSING',
          leaseVersion: input.claim.leaseVersion,
          leaseExpiresAt: { gt: input.now },
        },
        select: { idempotencyRecordId: true },
      });

      if (!aiJob) {
        throw new AiJobClaimLostError();
      }

      const featureJob = await transaction.taskExtractionJob.findFirst({
        where: {
          id: input.claim.jobId,
          datasetId: input.claim.datasetId,
          actorId: input.claim.actorId,
          wardId: input.claim.wardId,
          operation: TASK_EXTRACTION_OPERATION,
        },
        include: { evidence: true },
      });

      if (!featureJob) {
        throw new TaskPersistenceInvariantError();
      }

      const evidenceBySourceId = new Map(
        featureJob.evidence.map((evidence) => [
          readStoredEvidenceReference(evidence).sourceId,
          evidence,
        ]),
      );
      const duplicateTasks = await this.findDuplicateTasks(transaction, input);

      for (const candidate of input.candidates) {
        const evidence = candidate.evidenceSourceIds.map((sourceId) =>
          evidenceBySourceId.get(sourceId),
        );

        if (evidence.some((item) => item === undefined)) {
          throw new TaskPersistenceInvariantError();
        }

        const created = await transaction.taskExtractionCandidate.create({
          data: {
            datasetId: input.claim.datasetId,
            jobId: input.claim.jobId,
            patientId: candidate.patientId,
            title: candidate.title,
            description: candidate.description,
            dueAt: candidate.dueAt,
            workDate: candidate.workDate,
            aiSuggestedPriority: candidate.suggestedPriority,
            aiReasons: [...candidate.reasons],
            aiConfidence: candidate.confidence,
            duplicateTaskId:
              duplicateTasks.get(duplicateKey(candidate)) ?? null,
          },
          select: { id: true },
        });
        await transaction.taskExtractionCandidateEvidence.createMany({
          data: evidence.map((item) => ({
            datasetId: input.claim.datasetId,
            jobId: input.claim.jobId,
            candidateId: created.id,
            evidenceId: item!.id,
          })),
        });
      }

      const completed = await transaction.aiJob.updateMany({
        where: {
          id: input.claim.jobId,
          datasetId: input.claim.datasetId,
          status: 'PROCESSING',
          leaseVersion: input.claim.leaseVersion,
          leaseExpiresAt: { gt: input.now },
        },
        data: {
          status: 'SUCCEEDED',
          resultReference: input.claim.jobId,
          failureCode: null,
          retryable: null,
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });

      if (completed.count !== 1) {
        throw new AiJobClaimLostError();
      }

      const idempotency = await transaction.idempotencyRecord.updateMany({
        where: {
          id: aiJob.idempotencyRecordId,
          datasetId: input.claim.datasetId,
          status: 'PROCESSING',
        },
        data: {
          status: 'COMPLETED',
          resultReference: input.claim.jobId,
          updatedAt: input.now,
        },
      });

      if (idempotency.count !== 1) {
        throw new TaskPersistenceInvariantError();
      }
    });
  }

  async findExtractionJob(
    context: DemoSessionContext,
    jobId: string,
  ): Promise<TaskExtractionJobView> {
    const scope = {
      id: jobId,
      datasetId: context.datasetId,
      actorId: context.actorId,
      wardId: context.wardId,
      operation: TASK_EXTRACTION_OPERATION,
    };
    const aiJob = await this.prisma.aiJob.findFirst({
      where: scope,
      select: {
        status: true,
        failureCode: true,
        retryable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!aiJob) {
      throw new TaskNotFoundError();
    }

    if (aiJob.status !== 'SUCCEEDED') {
      const featureJob = await this.prisma.taskExtractionJob.findFirst({
        where: scope,
        select: { id: true },
      });

      if (!featureJob) {
        throw new TaskNotFoundError();
      }

      return {
        jobId,
        status: aiJob.status,
        failureCode: aiJob.failureCode,
        retryable: aiJob.retryable,
        candidates: [],
        createdAt: aiJob.createdAt,
        updatedAt: aiJob.updatedAt,
      };
    }

    const featureJob = await this.prisma.taskExtractionJob.findFirst({
      where: scope,
      include: {
        candidates: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            evidence: {
              include: {
                evidence: {
                  select: {
                    sourceType: true,
                    timelineEventId: true,
                    sourceTaskId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!featureJob) {
      throw new TaskNotFoundError();
    }

    return {
      jobId,
      status: aiJob.status,
      failureCode: aiJob.failureCode,
      retryable: aiJob.retryable,
      candidates: featureJob.candidates.map((candidate) => ({
        id: candidate.id,
        patientId: candidate.patientId,
        title: candidate.title,
        description: candidate.description,
        dueAt: candidate.dueAt,
        workDate: candidate.workDate,
        suggestedPriority: candidate.aiSuggestedPriority,
        reasons: candidate.aiReasons,
        confidence: candidate.aiConfidence,
        evidence: candidate.evidence.map(({ evidence }) =>
          readStoredEvidenceReference(evidence),
        ),
        duplicateTaskId: candidate.duplicateTaskId,
        appliedTaskId: candidate.appliedTaskId,
      })),
      createdAt: aiJob.createdAt,
      updatedAt: aiJob.updatedAt,
    };
  }

  async applyCandidates(
    input: ApplyTaskCandidatesInput,
  ): Promise<ApplyTaskCandidatesResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findIdempotencyRecord(
          transaction,
          input.context,
          TASK_APPLY_OPERATION,
          input.idempotencyKey,
        );
        if (existing)
          return this.resolveApplyReplay(transaction, input, existing);

        const featureJob = await transaction.taskExtractionJob.findFirst({
          where: {
            id: input.jobId,
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: TASK_EXTRACTION_OPERATION,
          },
        });
        const aiJob = await transaction.aiJob.findFirst({
          where: {
            id: input.jobId,
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: TASK_EXTRACTION_OPERATION,
          },
          select: { status: true },
        });
        if (!featureJob || !aiJob) throw new TaskNotFoundError();
        if (aiJob.status !== 'SUCCEEDED') {
          throw new TaskExtractionNotSucceededError();
        }

        const candidates = await transaction.taskExtractionCandidate.findMany({
          where: {
            datasetId: input.context.datasetId,
            jobId: input.jobId,
            id: { in: input.items.map(({ candidateId }) => candidateId) },
          },
          include: {
            evidence: {
              include: {
                evidence: {
                  select: {
                    sourceType: true,
                    timelineEventId: true,
                    sourceTaskId: true,
                  },
                },
              },
            },
          },
        });
        if (candidates.length !== input.items.length)
          throw new TaskNotFoundError();
        if (candidates.some(({ appliedAt }) => appliedAt !== null)) {
          throw new TaskCandidateAlreadyAppliedError();
        }

        await this.assertPatientsAccessible(
          transaction,
          input.context,
          input.now,
          candidates.flatMap(({ patientId }) =>
            patientId === null ? [] : [patientId],
          ),
        );
        const candidatesById = new Map(
          candidates.map((candidate) => [candidate.id, candidate]),
        );
        const record = await transaction.idempotencyRecord.create({
          data: {
            ...input.context,
            operation: TASK_APPLY_OPERATION,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          },
          select: { id: true },
        });
        const receipt = await transaction.taskApplyReceipt.create({
          data: {
            ...input.context,
            operation: TASK_APPLY_OPERATION,
            jobId: input.jobId,
            idempotencyRecordId: record.id,
            createdTaskIds: [],
            skippedCandidateIds: [],
          },
          select: { id: true },
        });
        const createable = candidates.filter(
          ({ duplicateTaskId }) => duplicateTaskId === null,
        );
        const currentDutyEndsAt =
          createable.length === 0
            ? null
            : await this.resolveCurrentDutyEndsAt(
                transaction,
                input.context,
                input.now,
              );
        const createdTaskIds: string[] = [];
        const skippedCandidateIds: string[] = [];

        for (const item of input.items) {
          const candidate = candidatesById.get(item.candidateId);
          if (!candidate) throw new TaskNotFoundError();

          if (candidate.duplicateTaskId !== null) {
            const marked = await transaction.taskExtractionCandidate.updateMany(
              {
                where: {
                  id: candidate.id,
                  datasetId: input.context.datasetId,
                  appliedAt: null,
                },
                data: {
                  applyReceiptId: receipt.id,
                  appliedByActorId: input.context.actorId,
                  appliedAt: input.now,
                },
              },
            );
            if (marked.count !== 1)
              throw new TaskCandidateAlreadyAppliedError();
            skippedCandidateIds.push(candidate.id);
            continue;
          }

          if (!currentDutyEndsAt) throw new TaskPersistenceInvariantError();
          const dueAt = item.dueAt === undefined ? candidate.dueAt : item.dueAt;
          const confirmedPriority = item.priorityOverride ?? null;
          const rulePriority = calculateTaskRulePriority({
            dueAt,
            now: input.now,
            currentDutyEndsAt,
          });
          const task = await transaction.task.create({
            data: {
              ...input.context,
              patientId: candidate.patientId,
              title: item.title ?? candidate.title,
              description: candidate.description,
              dueAt,
              workDate:
                dueAt === null
                  ? candidate.workDate
                  : deriveSeoulWorkDate(dueAt),
              source: 'AI_EXTRACTED',
              aiSuggestedPriority: candidate.aiSuggestedPriority,
              aiReasons: candidate.aiReasons,
              aiConfidence: candidate.aiConfidence,
              rulePriority,
              confirmedPriority,
            },
            select: { id: true },
          });
          await transaction.taskEvidence.createMany({
            data: candidate.evidence.map(({ evidence }) => ({
              datasetId: input.context.datasetId,
              taskId: task.id,
              ...toStoredEvidenceColumns(readStoredEvidenceReference(evidence)),
            })),
          });
          if (confirmedPriority !== null) {
            await transaction.taskPriorityAudit.create({
              data: {
                datasetId: input.context.datasetId,
                taskId: task.id,
                actorId: input.context.actorId,
                action:
                  confirmedPriority === candidate.aiSuggestedPriority
                    ? 'ACCEPT_AI'
                    : 'MANUAL_SET',
                newConfirmedPriority: confirmedPriority,
                aiSuggestedPriority: candidate.aiSuggestedPriority,
              },
            });
          }
          const marked = await transaction.taskExtractionCandidate.updateMany({
            where: {
              id: candidate.id,
              datasetId: input.context.datasetId,
              appliedAt: null,
            },
            data: {
              appliedTaskId: task.id,
              applyReceiptId: receipt.id,
              appliedByActorId: input.context.actorId,
              appliedAt: input.now,
            },
          });
          if (marked.count !== 1) throw new TaskCandidateAlreadyAppliedError();
          createdTaskIds.push(task.id);
        }

        await transaction.taskApplyReceipt.update({
          where: { id: receipt.id },
          data: { createdTaskIds, skippedCandidateIds },
        });
        const completed = await transaction.idempotencyRecord.updateMany({
          where: {
            id: record.id,
            datasetId: input.context.datasetId,
            status: 'PROCESSING',
          },
          data: {
            status: 'COMPLETED',
            resultReference: receipt.id,
            updatedAt: input.now,
          },
        });
        if (completed.count !== 1) throw new TaskPersistenceInvariantError();
        return { createdTaskIds, skippedCandidateIds, isReplay: false };
      });
    } catch (error: unknown) {
      if (!hasPrismaErrorCode(error, 'P2002')) throw error;
      const existing = await this.findIdempotencyRecord(
        this.prisma,
        input.context,
        TASK_APPLY_OPERATION,
        input.idempotencyKey,
      );
      if (!existing) throw error;
      return this.resolveApplyReplay(this.prisma, input, existing);
    }
  }

  async findIncompleteByPatients(
    context: TaskQueryContext,
    patientIds: readonly string[],
  ): Promise<readonly TaskReadModel[]> {
    const uniquePatientIds = [...new Set(patientIds)];
    if (uniquePatientIds.length === 0) return [];

    const now = this.clock.now();
    const accessiblePatientIds = await this.findAccessiblePatientIds(
      this.prisma,
      context,
      now,
      uniquePatientIds,
    );
    if (accessiblePatientIds.length === 0) return [];

    const currentDutyEndsAt = await this.resolveCurrentDutyEndsAt(
      this.prisma,
      context,
      now,
    );
    const tasks = await this.prisma.task.findMany({
      where: {
        datasetId: context.datasetId,
        wardId: context.wardId,
        actorId: context.actorId,
        patientId: { in: accessiblePatientIds },
        status: { in: ['TODO', 'IN_PROGRESS'] },
      },
      include: {
        evidence: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            sourceType: true,
            timelineEventId: true,
            sourceTaskId: true,
          },
        },
      },
    });

    return tasks
      .map((task) => {
        const rulePriority = calculateTaskRulePriority({
          dueAt: task.dueAt,
          now,
          currentDutyEndsAt,
        });
        const effectivePriority = getEffectiveTaskPriority(
          rulePriority,
          task.confirmedPriority,
        );
        return {
          id: task.id,
          patientId: task.patientId,
          title: task.title,
          dueAt: task.dueAt,
          effectivePriority,
          version: task.version,
          sourceReferences: task.evidence.map((evidence) => {
            const { sourceType, sourceId } =
              readStoredEvidenceReference(evidence);
            return `${sourceType}:${sourceId}`;
          }),
          updatedAt: task.updatedAt,
          createdAt: task.createdAt,
        };
      })
      .sort((left, right) => compareTaskOrdering(left, right))
      .map(
        ({
          id,
          patientId,
          title,
          dueAt,
          effectivePriority,
          version,
          sourceReferences,
          updatedAt,
        }) => ({
          id,
          patientId,
          title,
          dueAt,
          effectivePriority,
          version,
          sourceReferences,
          updatedAt,
        }),
      );
  }

  private async resolveCreateReplay(
    client: DatabaseClient,
    input: CreateTaskInput,
    record: IdempotencyRow,
  ): Promise<CreateTaskResult> {
    assertIdempotencyMatch(input.context.wardId, input.requestHash, record);

    if (record.status === 'PROCESSING') {
      throw new IdempotencyRequestInProgressError();
    }

    const receipt = await client.taskCreateReceipt.findFirst({
      where: {
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        operation: TASK_CREATE_OPERATION,
        idempotencyRecordId: record.id,
      },
      select: { taskId: true, responseSnapshot: true },
    });

    if (!receipt || record.resultReference !== receipt.taskId) {
      throw new IdempotencyInvariantViolationError();
    }

    return {
      task: deserializeTaskView(receipt.responseSnapshot),
      isReplay: true,
    };
  }

  private async resolveExtractionReplay(
    client: DatabaseClient,
    input: Pick<
      ReserveTaskExtractionInput,
      'context' | 'idempotencyKey' | 'requestHash'
    >,
    record: IdempotencyRow,
  ): Promise<ReserveTaskExtractionResult> {
    assertIdempotencyMatch(input.context.wardId, input.requestHash, record);
    const receipt = await client.taskExtractionRequestReceipt.findFirst({
      where: {
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        operation: TASK_EXTRACTION_OPERATION,
        idempotencyRecordId: record.id,
      },
      select: { jobId: true },
    });

    if (!receipt) {
      throw new IdempotencyInvariantViolationError();
    }

    const job = await client.aiJob.findFirst({
      where: {
        id: receipt.jobId,
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        operation: TASK_EXTRACTION_OPERATION,
      },
      select: { status: true },
    });

    if (
      !job ||
      (record.status === 'COMPLETED' &&
        record.resultReference !== receipt.jobId)
    ) {
      throw new IdempotencyInvariantViolationError();
    }

    return { jobId: receipt.jobId, status: job.status, isReplay: true };
  }

  private async resolveApplyReplay(
    client: DatabaseClient,
    input: ApplyTaskCandidatesInput,
    record: IdempotencyRow,
  ): Promise<ApplyTaskCandidatesResult> {
    assertIdempotencyMatch(input.context.wardId, input.requestHash, record);
    if (record.status === 'PROCESSING') {
      throw new IdempotencyRequestInProgressError();
    }

    const receipt = await client.taskApplyReceipt.findFirst({
      where: {
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        operation: TASK_APPLY_OPERATION,
        idempotencyRecordId: record.id,
        jobId: input.jobId,
      },
      select: {
        id: true,
        createdTaskIds: true,
        skippedCandidateIds: true,
      },
    });
    if (!receipt || record.resultReference !== receipt.id) {
      throw new IdempotencyInvariantViolationError();
    }
    return {
      createdTaskIds: receipt.createdTaskIds,
      skippedCandidateIds: receipt.skippedCandidateIds,
      isReplay: true,
    };
  }

  private findIdempotencyRecord(
    client: DatabaseClient,
    context: DemoSessionContext,
    operation: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRow | null> {
    return client.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: context.datasetId,
          actorId: context.actorId,
          operation,
          idempotencyKey,
        },
      },
      select: {
        id: true,
        wardId: true,
        requestHash: true,
        status: true,
        resultReference: true,
      },
    });
  }

  private async resolveCurrentDutyEndsAt(
    client: DatabaseClient,
    context: DemoSessionContext,
    now: Date,
  ): Promise<Date> {
    const shifts = await client.nurseShift.findMany({
      where: {
        datasetId: context.datasetId,
        nurseId: context.actorId,
        wardId: context.wardId,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      take: 2,
      select: { endsAt: true },
    });

    if (shifts.length !== 1) {
      throw new TaskCurrentDutyUnresolvedError();
    }

    return shifts[0].endsAt;
  }

  private async findAccessiblePatientIds(
    client: DatabaseClient,
    context: DemoSessionContext,
    now: Date,
    patientIds?: readonly string[],
  ): Promise<string[]> {
    const assignments = await client.patientAssignment.findMany({
      where: {
        datasetId: context.datasetId,
        wardId: context.wardId,
        nurseId: context.actorId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        ...(patientIds === undefined
          ? {}
          : { patientId: { in: [...new Set(patientIds)] } }),
      },
      distinct: ['patientId'],
      select: { patientId: true },
    });

    return assignments.map(({ patientId }) => patientId);
  }

  private async assertPatientsAccessible(
    client: DatabaseClient,
    context: DemoSessionContext,
    now: Date,
    patientIds: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(patientIds)];

    if (unique.length === 0) {
      return;
    }

    const accessible = await this.findAccessiblePatientIds(
      client,
      context,
      now,
      unique,
    );

    if (accessible.length !== unique.length) {
      throw new TaskNotFoundError();
    }
  }

  private async findDuplicateTasks(
    transaction: Prisma.TransactionClient,
    input: CompleteTaskExtractionInput,
  ): Promise<Map<string, string>> {
    if (input.candidates.length === 0) {
      return new Map();
    }

    const rows = await transaction.task.findMany({
      where: {
        datasetId: input.claim.datasetId,
        wardId: input.claim.wardId,
        actorId: input.claim.actorId,
        status: { in: ['TODO', 'IN_PROGRESS'] },
        OR: input.candidates.map((candidate) => ({
          patientId: candidate.patientId,
          title: candidate.title,
          dueAt: candidate.dueAt,
          workDate: candidate.workDate,
        })),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        patientId: true,
        title: true,
        dueAt: true,
        workDate: true,
      },
    });

    return new Map(rows.map((row) => [duplicateKey(row), row.id]));
  }

  private toTaskView(
    row: TaskRow,
    now: Date,
    currentDutyEndsAt: Date,
  ): TaskView {
    const rulePriority =
      row.status === 'DONE'
        ? row.rulePriority
        : calculateTaskRulePriority({
            dueAt: row.dueAt,
            now,
            currentDutyEndsAt,
          });

    return {
      ...row,
      aiReasons: row.aiReasons,
      rulePriority,
      effectivePriority: getEffectiveTaskPriority(
        rulePriority,
        row.confirmedPriority,
      ),
    };
  }
}

function assertIdempotencyMatch(
  expectedWardId: string,
  expectedRequestHash: string,
  record: IdempotencyRow,
): void {
  if (
    record.wardId !== expectedWardId ||
    record.requestHash !== expectedRequestHash
  ) {
    throw new IdempotencyKeyReusedError();
  }
}

function duplicateKey(input: {
  patientId: string | null;
  title: string;
  dueAt: Date | null;
  workDate: Date;
}): string {
  return JSON.stringify({
    patientId: input.patientId,
    title: input.title,
    dueAt: input.dueAt?.toISOString() ?? null,
    workDate: input.workDate.toISOString().slice(0, 10),
  });
}

type StoredEvidenceColumns = {
  sourceType: TaskEvidenceSourceType;
  timelineEventId: string | null;
  sourceTaskId: string | null;
};

function toStoredEvidenceColumns(input: {
  sourceType: TaskEvidenceSourceType;
  sourceId: string;
}): StoredEvidenceColumns {
  return input.sourceType === 'TIMELINE_EVENT'
    ? {
        sourceType: input.sourceType,
        timelineEventId: input.sourceId,
        sourceTaskId: null,
      }
    : {
        sourceType: input.sourceType,
        timelineEventId: null,
        sourceTaskId: input.sourceId,
      };
}

function readStoredEvidenceReference(input: StoredEvidenceColumns): {
  sourceType: TaskEvidenceSourceType;
  sourceId: string;
} {
  if (
    input.sourceType === 'TIMELINE_EVENT' &&
    input.timelineEventId !== null &&
    input.sourceTaskId === null
  ) {
    return { sourceType: input.sourceType, sourceId: input.timelineEventId };
  }

  if (
    input.sourceType === 'TASK' &&
    input.sourceTaskId !== null &&
    input.timelineEventId === null
  ) {
    return { sourceType: input.sourceType, sourceId: input.sourceTaskId };
  }

  throw new TaskPersistenceInvariantError();
}

function serializeTaskView(task: TaskView): Prisma.InputJsonObject {
  return {
    ...task,
    patientId: task.patientId,
    description: task.description,
    dueAt: task.dueAt?.toISOString() ?? null,
    workDate: task.workDate.toISOString(),
    aiSuggestedPriority: task.aiSuggestedPriority,
    aiConfidence: task.aiConfidence,
    confirmedPriority: task.confirmedPriority,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function deserializeTaskView(value: Prisma.JsonValue): TaskView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new IdempotencyInvariantViolationError();
  }

  const snapshot = value as Record<string, Prisma.JsonValue>;
  const dueAt = readNullableDate(snapshot.dueAt);
  const workDate = readDate(snapshot.workDate);
  const createdAt = readDate(snapshot.createdAt);
  const updatedAt = readDate(snapshot.updatedAt);
  const aiReasons = Array.isArray(snapshot.aiReasons)
    ? snapshot.aiReasons.filter(
        (reason): reason is string => typeof reason === 'string',
      )
    : null;

  if (
    typeof snapshot.id !== 'string' ||
    (snapshot.patientId !== null && typeof snapshot.patientId !== 'string') ||
    typeof snapshot.title !== 'string' ||
    (snapshot.description !== null &&
      typeof snapshot.description !== 'string') ||
    typeof snapshot.status !== 'string' ||
    typeof snapshot.source !== 'string' ||
    typeof snapshot.rulePriority !== 'string' ||
    typeof snapshot.effectivePriority !== 'string' ||
    typeof snapshot.version !== 'number' ||
    aiReasons === null
  ) {
    throw new IdempotencyInvariantViolationError();
  }

  return {
    id: snapshot.id,
    patientId: snapshot.patientId,
    title: snapshot.title,
    description: snapshot.description,
    dueAt,
    workDate,
    status: snapshot.status as TaskView['status'],
    source: snapshot.source as TaskView['source'],
    aiSuggestedPriority:
      (snapshot.aiSuggestedPriority as TaskView['aiSuggestedPriority']) ?? null,
    aiReasons,
    aiConfidence: (snapshot.aiConfidence as TaskAiConfidence | null) ?? null,
    rulePriority: snapshot.rulePriority as TaskPriority,
    confirmedPriority:
      (snapshot.confirmedPriority as TaskPriority | null) ?? null,
    effectivePriority: snapshot.effectivePriority as TaskPriority,
    version: snapshot.version,
    createdAt,
    updatedAt,
  };
}

function readDate(value: Prisma.JsonValue | undefined): Date {
  if (typeof value !== 'string') {
    throw new IdempotencyInvariantViolationError();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new IdempotencyInvariantViolationError();
  }

  return parsed;
}

function readNullableDate(value: Prisma.JsonValue | undefined): Date | null {
  return value === null ? null : readDate(value);
}

function hasPrismaErrorCode(
  error: unknown,
  expectedCode: string,
): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === expectedCode
  );
}
