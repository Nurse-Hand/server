import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  TaskCommandInvalidError,
  TaskDueAtInvalidError,
} from '../domain/task.errors';
import {
  TASK_LIST_SORTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskListSort,
  type TaskPriority,
  type TaskStatus,
} from '../domain/task.types';
import {
  deriveSeoulWorkDate,
  parseTaskWorkDate,
} from '../domain/task-work-date';
import {
  TASK_REPOSITORY,
  type CreateTaskResult,
  type ListTasksResult,
  type TaskRepository,
  type TaskView,
} from './ports/task.repository';

type ListTasksCommand = {
  date: string;
  status?: TaskStatus;
  patientId?: string;
  sort?: TaskListSort;
  cursor?: string;
  limit?: number;
};

type CreateTaskCommand = {
  patientId?: string | null;
  title: string;
  description?: string | null;
  dueAt: string;
  priorityOverride?: TaskPriority | null;
};

type UpdateTaskCommand = {
  version: number;
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  status?: TaskStatus;
  priorityOverride?: TaskPriority | null;
};

const TIME_ZONE_SUFFIX_PATTERN = /T.*(?:Z|[+-]\d{2}:\d{2})$/;

@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly repository: TaskRepository,
    private readonly clock: Clock,
  ) {}

  list(
    context: DemoSessionContext,
    command: ListTasksCommand,
  ): Promise<ListTasksResult> {
    if (
      command.status !== undefined &&
      !TASK_STATUSES.includes(command.status)
    ) {
      throw new TaskCommandInvalidError();
    }

    const sort = command.sort ?? 'priority';

    if (!TASK_LIST_SORTS.includes(sort)) {
      throw new TaskCommandInvalidError();
    }

    const limit = command.limit ?? 20;

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new TaskCommandInvalidError();
    }

    return this.repository.list({
      context,
      workDate: parseTaskWorkDate(command.date),
      date: command.date,
      ...(command.status === undefined ? {} : { status: command.status }),
      ...(command.patientId === undefined
        ? {}
        : { patientId: command.patientId }),
      sort,
      ...(command.cursor === undefined ? {} : { cursor: command.cursor }),
      limit,
      now: this.clock.now(),
    });
  }

  create(
    context: DemoSessionContext,
    idempotencyKey: string,
    _requestId: string,
    command: CreateTaskCommand,
  ): Promise<CreateTaskResult> {
    assertIdempotencyKey(idempotencyKey);
    const now = this.clock.now();
    const dueAt = parseTimestamp(command.dueAt);

    if (dueAt.getTime() <= now.getTime()) {
      throw new TaskDueAtInvalidError(
        '직접 생성 업무의 dueAt은 현재보다 미래여야 합니다.',
      );
    }

    const title = normalizeRequiredText(command.title, 200);
    const description = normalizeNullableText(command.description, 1000);
    const patientId = command.patientId ?? null;
    const confirmedPriority = command.priorityOverride ?? null;
    assertPriorityOrNull(confirmedPriority);
    const normalizedBody = {
      description,
      dueAt: dueAt.toISOString(),
      patientId,
      priorityOverride: confirmedPriority,
      title,
    };

    return this.repository.create({
      context,
      idempotencyKey,
      requestHash: createCanonicalRequestHash({
        path: {},
        query: {},
        body: normalizedBody,
      }),
      patientId,
      title,
      description,
      dueAt,
      workDate: deriveSeoulWorkDate(dueAt),
      confirmedPriority,
      now,
    });
  }

  update(
    context: DemoSessionContext,
    taskId: string,
    command: UpdateTaskCommand,
  ): Promise<TaskView> {
    const hasTitle = command.title !== undefined;
    const hasDescription = command.description !== undefined;
    const hasDueAt = command.dueAt !== undefined;
    const hasStatus = command.status !== undefined;
    const hasPriority = command.priorityOverride !== undefined;

    if (
      !hasTitle &&
      !hasDescription &&
      !hasDueAt &&
      !hasStatus &&
      !hasPriority
    ) {
      throw new TaskCommandInvalidError(
        'version 외에 수정할 필드가 하나 이상 필요합니다.',
      );
    }

    if (!Number.isInteger(command.version) || command.version < 1) {
      throw new TaskCommandInvalidError();
    }

    if (hasDueAt && command.dueAt === null) {
      throw new TaskDueAtInvalidError('dueAt을 null로 되돌릴 수 없습니다.');
    }

    const dueAt = hasDueAt ? parseTimestamp(command.dueAt!) : undefined;
    const confirmedPriority = hasPriority
      ? (command.priorityOverride ?? null)
      : undefined;

    if (confirmedPriority !== undefined) {
      assertPriorityOrNull(confirmedPriority);
    }

    if (
      command.status !== undefined &&
      !TASK_STATUSES.includes(command.status)
    ) {
      throw new TaskCommandInvalidError();
    }

    return this.repository.update({
      context,
      taskId,
      expectedVersion: command.version,
      ...(hasTitle
        ? { title: normalizeRequiredText(command.title!, 200) }
        : {}),
      ...(hasDescription
        ? { description: normalizeNullableText(command.description, 1000) }
        : {}),
      ...(dueAt === undefined
        ? {}
        : { dueAt, workDate: deriveSeoulWorkDate(dueAt) }),
      ...(hasStatus ? { status: command.status } : {}),
      ...(hasPriority ? { confirmedPriority: confirmedPriority! } : {}),
      now: this.clock.now(),
    });
  }
}

function parseTimestamp(value: string): Date {
  if (!TIME_ZONE_SUFFIX_PATTERN.test(value)) {
    throw new TaskCommandInvalidError(
      'timestamp에는 timezone이 포함되어야 합니다.',
    );
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new TaskCommandInvalidError('timestamp 형식이 올바르지 않습니다.');
  }

  return parsed;
}

function normalizeRequiredText(value: string, maxLength: number): string {
  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TaskCommandInvalidError();
  }

  return normalized;
}

function normalizeNullableText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new TaskCommandInvalidError();
  }

  return normalized;
}

function assertPriorityOrNull(
  value: TaskPriority | null,
): asserts value is TaskPriority | null {
  if (value !== null && !TASK_PRIORITIES.includes(value)) {
    throw new TaskCommandInvalidError();
  }
}

function assertIdempotencyKey(value: string): void {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(value)) {
    throw new TaskCommandInvalidError('X-Idempotency-Key가 올바르지 않습니다.');
  }
}
