export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ['MANUAL', 'AI_EXTRACTED'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

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

export const TASK_EXTRACTION_OPERATION = 'tasks.extract';
export const TASK_CREATE_OPERATION = 'tasks.create';
export const TASK_APPLY_OPERATION = 'tasks.extract.apply';
export const TASK_EXTRACTION_MAX_ATTEMPTS = 3;
export const TASK_EXTRACTION_LEASE_MILLISECONDS = 60_000;
