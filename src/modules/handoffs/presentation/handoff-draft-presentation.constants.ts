export {
  HANDOFF_DEFAULT_LIST_LIMIT as DEFAULT_HANDOFF_PAGE_LIMIT,
  HANDOFF_MAX_LIST_LIMIT as MAX_HANDOFF_PAGE_LIMIT,
  HANDOFF_ROOT_STATUSES,
  HANDOFF_CLINICAL_SECTIONS,
  HANDOFF_SOURCE_TYPES as HANDOFF_EVIDENCE_TYPES,
  HANDOFF_TEMPLATE_IDS,
} from '../domain/handoff.constants';
export type {
  HandoffRootStatus,
  HandoffClinicalSection,
  HandoffSourceType as HandoffEvidenceType,
  HandoffTemplateId,
} from '../domain/handoff.constants';

export const HANDOFF_DRAFT_LIST_STATUSES = ['DRAFT', 'FINALIZED'] as const;
export type HandoffDraftListStatus =
  (typeof HANDOFF_DRAFT_LIST_STATUSES)[number];

export const AI_JOB_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const HANDOFF_EVIDENCE_EXCERPT_KINDS = [
  'SUMMARY',
  'TASK_TITLE',
] as const;
export type HandoffEvidenceExcerptKind =
  (typeof HANDOFF_EVIDENCE_EXCERPT_KINDS)[number];

export const MAX_HANDOFF_CURSOR_LENGTH = 512;
export const MAX_HANDOFF_SECTION_LENGTH = 10_000;
export const MAX_HANDOFF_PATIENTS = 200;
export const MAX_HANDOFF_TASKS = 500;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
export const MAX_VERSION = 2_147_483_647;
