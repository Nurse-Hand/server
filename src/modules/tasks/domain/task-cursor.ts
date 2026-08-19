import { createHash } from 'node:crypto';
import { TaskCursorInvalidError } from './task.errors';
import type { TaskListSort, TaskStatus } from './task.types';

type TaskCursorPayload = {
  version: 1;
  filterHash: string;
  taskId: string;
};

export type TaskCursorFilter = {
  date: string;
  sort: TaskListSort;
  status?: TaskStatus;
  patientId?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeTaskCursor(input: {
  filter: TaskCursorFilter;
  taskId: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      filterHash: hashFilter(input.filter),
      taskId: input.taskId,
    } satisfies TaskCursorPayload),
    'utf8',
  ).toString('base64url');
}

export function decodeTaskCursor(
  cursor: string,
  expectedFilter: TaskCursorFilter,
): TaskCursorPayload {
  if (cursor.length === 0 || cursor.length > 1024) {
    throw new TaskCursorInvalidError();
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;

    if (!isCursorPayload(parsed)) {
      throw new TaskCursorInvalidError();
    }

    if (parsed.filterHash !== hashFilter(expectedFilter)) {
      throw new TaskCursorInvalidError();
    }

    return parsed;
  } catch (error: unknown) {
    if (error instanceof TaskCursorInvalidError) {
      throw error;
    }

    throw new TaskCursorInvalidError();
  }
}

function isCursorPayload(value: unknown): value is TaskCursorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<TaskCursorPayload>;
  return (
    candidate.version === 1 &&
    typeof candidate.filterHash === 'string' &&
    /^[a-f0-9]{64}$/.test(candidate.filterHash) &&
    typeof candidate.taskId === 'string' &&
    UUID_PATTERN.test(candidate.taskId)
  );
}

function hashFilter(filter: TaskCursorFilter): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        date: filter.date,
        patientId: filter.patientId ?? null,
        sort: filter.sort,
        status: filter.status ?? null,
      }),
      'utf8',
    )
    .digest('hex');
}
