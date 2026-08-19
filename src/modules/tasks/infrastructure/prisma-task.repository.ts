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
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  CreateTaskInput,
  CreateTaskResult,
  ListTasksInput,
  ListTasksResult,
  TaskRepository,
  TaskView,
  UpdateTaskInput,
} from '../application/ports/task.repository';
import {
  TaskCompletedImmutableError,
  TaskCurrentDutyUnresolvedError,
  TaskCursorInvalidError,
  TaskNotFoundError,
  TaskPersistenceInvariantError,
} from '../domain/task.errors';
import {
  calculateTaskRulePriority,
  compareTaskOrdering,
  getEffectiveTaskPriority,
} from '../domain/task-priority.policy';
import { decodeTaskCursor, encodeTaskCursor } from '../domain/task-cursor';
import {
  TASK_CREATE_OPERATION,
  type TaskAiConfidence,
  type TaskPriority,
} from '../domain/task.types';

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
export class PrismaTaskRepository implements TaskRepository {
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
