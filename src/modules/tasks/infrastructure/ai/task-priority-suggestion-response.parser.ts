import { isUUID } from 'class-validator';
import { TaskAiResponseInvalidError } from '../../domain/task.errors';
import {
  compareTaskPrioritySuggestions,
  mapAiTaskPriority,
} from '../../domain/task-priority.policy';
import {
  TASK_PRIORITY_SUGGESTION_REASON_LIMIT,
  TASK_PRIORITY_SUGGESTION_REASON_MAX_LENGTH,
  type TaskPriority,
} from '../../domain/task.types';

export type ParsedTaskPrioritySuggestion = {
  taskId: string;
  aiScore: number;
  aiSuggestedPriority: TaskPriority;
  reasons: readonly string[];
};

export type ParsedTaskPrioritySuggestionResponse = {
  requestId: string;
  suggestions: readonly ParsedTaskPrioritySuggestion[];
};

export function parseTaskPrioritySuggestionResponse(
  value: unknown,
  input: {
    requestId: string;
    taskIds: readonly string[];
  },
): ParsedTaskPrioritySuggestionResponse {
  assertExpectedIdentifiers(input);
  const response = readObject(value);
  assertExactKeys(response, ['requestId', 'results']);

  if (response.requestId !== input.requestId) invalidResponse();

  const results = readArray(response.results);
  if (results.length !== input.taskIds.length) invalidResponse();

  const expectedTaskIds = new Set(input.taskIds);
  const resultTaskIds = new Set<string>();
  const suggestions = results.map((resultValue) => {
    const result = readObject(resultValue);
    assertExactKeys(result, ['taskId', 'score', 'priority', 'reasons']);
    const taskId = readUuid(result.taskId);
    if (!expectedTaskIds.has(taskId) || resultTaskIds.has(taskId)) {
      invalidResponse();
    }
    resultTaskIds.add(taskId);

    return {
      taskId,
      aiScore: readScore(result.score),
      aiSuggestedPriority: mapAiTaskPriority(readAiPriority(result.priority)),
      reasons: readReasons(result.reasons),
    };
  });

  if (resultTaskIds.size !== expectedTaskIds.size) invalidResponse();
  suggestions.sort(compareTaskPrioritySuggestions);

  return { requestId: input.requestId, suggestions };
}

function assertExpectedIdentifiers(input: {
  requestId: string;
  taskIds: readonly string[];
}): void {
  if (!isUUID(input.requestId)) invalidResponse();
  const taskIds = new Set<string>();
  for (const taskId of input.taskIds) {
    if (!isUUID(taskId) || taskIds.has(taskId)) invalidResponse();
    taskIds.add(taskId);
  }
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidResponse();
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) invalidResponse();
  return value as Record<string, unknown>;
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  return value;
}

function readUuid(value: unknown): string {
  if (typeof value !== 'string' || !isUUID(value)) invalidResponse();
  return value;
}

function readScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalidResponse();
  }
  return value;
}

function readAiPriority(value: unknown): 'CRITICAL' | 'LOW' {
  if (value !== 'CRITICAL' && value !== 'LOW') invalidResponse();
  return value;
}

function readReasons(value: unknown): readonly string[] {
  const reasons = readArray(value);
  if (reasons.length > TASK_PRIORITY_SUGGESTION_REASON_LIMIT) invalidResponse();
  return reasons.map((reason) => {
    if (
      typeof reason !== 'string' ||
      reason.length > TASK_PRIORITY_SUGGESTION_REASON_MAX_LENGTH
    ) {
      invalidResponse();
    }
    return reason;
  });
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    invalidResponse();
  }
}

function invalidResponse(): never {
  throw new TaskAiResponseInvalidError();
}
