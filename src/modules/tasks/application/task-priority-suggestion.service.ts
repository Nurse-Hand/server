import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  TaskAiResponseInvalidError,
  TaskAiTimeoutError,
  TaskAiUnavailableError,
  TaskCommandInvalidError,
  TaskPrioritySuggestionLimitExceededError,
} from '../domain/task.errors';
import { compareTaskPrioritySuggestions } from '../domain/task-priority.policy';
import { TASK_PRIORITY_SUGGESTION_BATCH_LIMIT } from '../domain/task.types';
import { parseTaskWorkDate } from '../domain/task-work-date';
import {
  TASK_PRIORITY_SUGGESTION_GATEWAY,
  type TaskPrioritySuggestionGateway,
} from './ports/task-priority-suggestion.gateway';
import {
  TASK_PRIORITY_SUGGESTION_REPOSITORY,
  type TaskPrioritySuggestionBatchResult,
  type TaskPrioritySuggestionData,
  type TaskPrioritySuggestionFailure,
  type TaskPrioritySuggestionRepository,
} from './ports/task-priority-suggestion.repository';

@Injectable()
export class TaskPrioritySuggestionService {
  constructor(
    @Inject(TASK_PRIORITY_SUGGESTION_REPOSITORY)
    private readonly repository: TaskPrioritySuggestionRepository,
    @Inject(TASK_PRIORITY_SUGGESTION_GATEWAY)
    private readonly gateway: TaskPrioritySuggestionGateway,
    private readonly clock: Clock,
  ) {}

  async createBatch(
    context: DemoSessionContext,
    idempotencyKey: string,
    requestId: string,
    command: { date: string },
  ): Promise<TaskPrioritySuggestionBatchResult> {
    assertIdempotencyKey(idempotencyKey);
    const workDate = parseTaskWorkDate(command.date);
    const now = this.clock.now();
    const snapshot = [
      ...(await this.repository.findSnapshot({ context, workDate, now })),
    ].sort((left, right) => left.taskId.localeCompare(right.taskId));

    if (snapshot.length > TASK_PRIORITY_SUGGESTION_BATCH_LIMIT) {
      throw new TaskPrioritySuggestionLimitExceededError();
    }

    const requestHash = createCanonicalRequestHash({
      path: {},
      query: {},
      body: {
        date: command.date,
        tasks: snapshot.map((task) => ({
          taskId: task.taskId,
          patientId: task.patientId,
          title: task.title,
          dueAt: task.dueAt?.toISOString() ?? null,
          version: task.version,
        })),
      },
    });
    const reservation = await this.repository.reserve({
      context,
      workDate,
      idempotencyKey,
      requestHash,
      requestId,
      inputSnapshot: snapshot,
      now,
    });

    if (reservation.state === 'SUCCEEDED') return reservation.result;
    if (reservation.state === 'FAILED') throwFailure(reservation.failure);

    const skippedTaskIds = snapshot
      .filter(({ patientId }) => patientId === null)
      .map(({ taskId }) => taskId);
    const evaluableTasks = snapshot.filter(
      (task): task is typeof task & { patientId: string } =>
        task.patientId !== null,
    );

    if (evaluableTasks.length === 0) {
      return this.repository.completeSuccess({
        context,
        batchId: reservation.batchId,
        suggestions: [],
        skippedTaskIds,
        evaluatedAt: this.clock.now(),
      });
    }

    let suggestions: Omit<TaskPrioritySuggestionData, 'suggestionId'>[];
    try {
      const aiResult = await this.gateway.prioritize({
        requestId,
        tasks: evaluableTasks.map((task) => ({
          taskId: task.taskId,
          patientId: task.patientId,
          title: task.title,
          dueAt: task.dueAt?.toISOString() ?? null,
          carriedOver: false,
        })),
        now: now.toISOString(),
      });
      const versionByTaskId = new Map(
        evaluableTasks.map(({ taskId, version }) => [taskId, version]),
      );
      suggestions = aiResult.suggestions.map((suggestion) => {
        const taskVersion = versionByTaskId.get(suggestion.taskId);
        if (taskVersion === undefined) throw new TaskAiResponseInvalidError();
        return { ...suggestion, taskVersion };
      });
    } catch (error: unknown) {
      const failure = toFailure(error);
      await this.repository.completeFailure({
        context,
        batchId: reservation.batchId,
        failure,
        evaluatedAt: this.clock.now(),
      });
      throwFailure(failure);
    }

    return this.repository.completeSuccess({
      context,
      batchId: reservation.batchId,
      suggestions: suggestions.sort(compareTaskPrioritySuggestions),
      skippedTaskIds,
      evaluatedAt: this.clock.now(),
    });
  }
}

function toFailure(error: unknown): TaskPrioritySuggestionFailure {
  if (error instanceof TaskAiTimeoutError) {
    return { code: 'TASK_AI_TIMEOUT', httpStatus: 504 };
  }
  if (error instanceof TaskAiResponseInvalidError) {
    return { code: 'TASK_AI_RESPONSE_INVALID', httpStatus: 502 };
  }
  return { code: 'TASK_AI_UNAVAILABLE', httpStatus: 503 };
}

function throwFailure(failure: TaskPrioritySuggestionFailure): never {
  if (failure.code === 'TASK_AI_TIMEOUT') throw new TaskAiTimeoutError();
  if (failure.code === 'TASK_AI_RESPONSE_INVALID') {
    throw new TaskAiResponseInvalidError();
  }
  throw new TaskAiUnavailableError();
}

function assertIdempotencyKey(value: string): void {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(value)) {
    throw new TaskCommandInvalidError('X-Idempotency-Key가 올바르지 않습니다.');
  }
}
