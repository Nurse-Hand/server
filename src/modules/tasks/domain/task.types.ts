export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ['MANUAL', 'AI_EXTRACTED'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_SCOPE_TYPES = ['PATIENT', 'WARD'] as const;
export type TaskScopeType = (typeof TASK_SCOPE_TYPES)[number];

export const TASK_PRIORITY_SIGNAL_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPrioritySignalLevel =
  (typeof TASK_PRIORITY_SIGNAL_LEVELS)[number];

export const TASK_AI_CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type TaskAiConfidence = (typeof TASK_AI_CONFIDENCES)[number];

export const TASK_LIST_SORTS = ['priority', 'dueAt'] as const;
export type TaskListSort = (typeof TASK_LIST_SORTS)[number];

export const TASK_EVIDENCE_SOURCE_TYPES = ['TIMELINE_EVENT', 'TASK'] as const;
export type TaskEvidenceSourceType =
  (typeof TASK_EVIDENCE_SOURCE_TYPES)[number];

export const TASK_PRIORITY_AUDIT_ACTIONS = [
  'ACCEPT_AI',
  'MANUAL_SET',
  'CLEARED',
] as const;
export type TaskPriorityAuditAction =
  (typeof TASK_PRIORITY_AUDIT_ACTIONS)[number];

export const TASK_PRIORITY_SUGGESTION_BATCH_STATUSES = [
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
] as const;
export type TaskPrioritySuggestionBatchStatus =
  (typeof TASK_PRIORITY_SUGGESTION_BATCH_STATUSES)[number];

export const TASK_PRIORITY_AI_PRIORITIES = [
  'CRITICAL',
  'HIGH',
  'NORMAL',
] as const;
export type TaskPriorityAiPriority =
  (typeof TASK_PRIORITY_AI_PRIORITIES)[number];
export type TaskPriorityAiInput = TaskPriorityAiPriority | 'LOW';

export const TASK_PRIORITY_SUGGESTION_OPERATION = 'tasks.priority-suggestions';
export const TASK_PRIORITY_SUGGESTION_CONTRACT_VERSION = 'tasks-prioritize-v1';
export const TASK_PRIORITY_SUGGESTION_BATCH_LIMIT = 50;
export const TASK_PRIORITY_SUGGESTION_REASON_LIMIT = 5;
export const TASK_PRIORITY_SUGGESTION_REASON_MAX_LENGTH = 200;

export const TASK_EXTRACTION_OPERATION = 'tasks.extract';
export const TASK_CREATE_OPERATION = 'tasks.create';
export const TASK_APPLY_OPERATION = 'tasks.extract.apply';
export const TASK_EXTRACTION_MAX_ATTEMPTS = 3;
export const TASK_EXTRACTION_LEASE_MILLISECONDS = 60_000;
