import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type { TaskPriority } from '../../domain/task.types';

export const TASK_PRIORITY_SUGGESTION_REPOSITORY = Symbol(
  'TASK_PRIORITY_SUGGESTION_REPOSITORY',
);

export type TaskPrioritySuggestionSnapshotTask = {
  taskId: string;
  patientId: string | null;
  title: string;
  dueAt: Date | null;
  version: number;
};

export type TaskPrioritySuggestionData = {
  suggestionId: string;
  taskId: string;
  aiScore: number;
  aiSuggestedPriority: TaskPriority;
  reasons: readonly string[];
};

export type TaskPrioritySuggestionBatchResult = {
  batchId: string;
  evaluatedAt: Date;
  contractVersion: string;
  suggestions: readonly TaskPrioritySuggestionData[];
  skippedTaskIds: readonly string[];
  isReplay: boolean;
};

export type TaskPrioritySuggestionFailure = {
  code: 'TASK_AI_TIMEOUT' | 'TASK_AI_RESPONSE_INVALID' | 'TASK_AI_UNAVAILABLE';
  httpStatus: 502 | 503 | 504;
};

export type ReserveTaskPrioritySuggestionResult =
  | { state: 'RESERVED'; batchId: string }
  | { state: 'SUCCEEDED'; result: TaskPrioritySuggestionBatchResult }
  | { state: 'FAILED'; failure: TaskPrioritySuggestionFailure };

export interface TaskPrioritySuggestionRepository {
  findSnapshot(input: {
    context: DemoSessionContext;
    workDate: Date;
  }): Promise<readonly TaskPrioritySuggestionSnapshotTask[]>;
  reserve(input: {
    context: DemoSessionContext;
    workDate: Date;
    idempotencyKey: string;
    requestHash: string;
    requestId: string;
    inputSnapshot: readonly TaskPrioritySuggestionSnapshotTask[];
    now: Date;
  }): Promise<ReserveTaskPrioritySuggestionResult>;
  completeSuccess(input: {
    context: DemoSessionContext;
    batchId: string;
    suggestions: readonly Omit<TaskPrioritySuggestionData, 'suggestionId'>[];
    skippedTaskIds: readonly string[];
    evaluatedAt: Date;
  }): Promise<TaskPrioritySuggestionBatchResult>;
  completeFailure(input: {
    context: DemoSessionContext;
    batchId: string;
    failure: TaskPrioritySuggestionFailure;
    evaluatedAt: Date;
  }): Promise<void>;
}
