export {
  HANDOFF_PRECHECK_ANSWERS,
  HANDOFF_PRECHECK_SEVERITIES,
  HANDOFF_SOURCE_TYPES as HANDOFF_EVIDENCE_TYPES,
  HANDOFF_TARGET_DUTIES as SHIFT_DUTIES,
} from '../domain/handoff.constants';
export type {
  HandoffPrecheckAnswer,
  HandoffPrecheckSeverity,
  HandoffSourceType as HandoffEvidenceType,
  HandoffTargetDuty as ShiftDuty,
} from '../domain/handoff.constants';

export const HANDOFF_EVIDENCE_EXCERPT_KINDS = [
  'UTTERANCE',
  'SUMMARY',
  'TASK_TITLE',
] as const;
export type HandoffEvidenceExcerptKind =
  (typeof HANDOFF_EVIDENCE_EXCERPT_KINDS)[number];

export const AI_JOB_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const MAX_HANDOFF_COMMENT_LENGTH = 1_000;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
export const MAX_VERSION = 2_147_483_647;
