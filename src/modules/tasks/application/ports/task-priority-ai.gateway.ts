import type { TaskAiConfidence, TaskPriority } from '../../domain/task.types';
import type { ExtractedTaskCandidate } from './task-extraction-ai.gateway';

export const TASK_PRIORITY_AI_GATEWAY = Symbol('TASK_PRIORITY_AI_GATEWAY');

export type TaskPrioritySuggestion = {
  candidateKey: string;
  suggestedPriority: TaskPriority;
  reasons: readonly string[];
  confidence: TaskAiConfidence;
  evidenceSourceIds: readonly string[];
};

export interface TaskPriorityAiGateway {
  prioritize(input: {
    requestId: string;
    candidates: readonly ExtractedTaskCandidate[];
  }): Promise<readonly TaskPrioritySuggestion[]>;
}
