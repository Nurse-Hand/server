import type { TaskPriority } from '../../domain/task.types';

export const TASK_PRIORITY_SUGGESTION_GATEWAY = Symbol(
  'TASK_PRIORITY_SUGGESTION_GATEWAY',
);

export type TaskPrioritySuggestionGatewayInput = {
  requestId: string;
  tasks: readonly {
    taskId: string;
    patientId: string;
    title: string;
    dueAt: string | null;
    carriedOver: boolean;
  }[];
  now: string;
};

export type TaskPrioritySuggestionGatewayResult = {
  requestId: string;
  suggestions: readonly {
    taskId: string;
    aiScore: number;
    aiSuggestedPriority: TaskPriority;
    reasons: readonly string[];
  }[];
};

export interface TaskPrioritySuggestionGateway {
  prioritize(
    input: TaskPrioritySuggestionGatewayInput,
  ): Promise<TaskPrioritySuggestionGatewayResult>;
}
