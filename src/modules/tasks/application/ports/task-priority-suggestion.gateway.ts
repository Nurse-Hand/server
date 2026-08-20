import type { TaskPriority } from '../../domain/task.types';
import type { TaskPriorityMeta } from './task.repository';

export const TASK_PRIORITY_SUGGESTION_GATEWAY = Symbol(
  'TASK_PRIORITY_SUGGESTION_GATEWAY',
);

export type TaskPrioritySuggestionGatewayInput = {
  requestId: string;
  tasks: readonly {
    taskId: string;
    scopeType: 'PATIENT' | 'WARD';
    patientId: string | null;
    locationLabel: string | null;
    title: string;
    description: string | null;
    dueAt: string | null;
    isCarryOver: boolean;
    dependencyTaskIds: readonly string[];
    priorityMeta: TaskPriorityMeta;
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
