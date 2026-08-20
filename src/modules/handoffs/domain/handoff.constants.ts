export const HANDOFF_ROOT_STATUSES = [
  'GENERATING',
  'DRAFT',
  'FINALIZED',
] as const;

export type HandoffRootStatus = (typeof HANDOFF_ROOT_STATUSES)[number];

export const HANDOFF_LIST_STATUSES = [
  'DRAFT',
  'FINALIZED',
  'ACKNOWLEDGED',
] as const;

export type HandoffListStatus = (typeof HANDOFF_LIST_STATUSES)[number];

export const HANDOFF_PRECHECK_SEVERITIES = ['CRITICAL', 'RECOMMENDED'] as const;

export type HandoffPrecheckSeverity =
  (typeof HANDOFF_PRECHECK_SEVERITIES)[number];

export const HANDOFF_PRECHECK_ANSWERS = [
  'NO_ISSUE',
  'INCLUDE_HANDOFF',
  'UNVERIFIED',
  'NOT_APPLICABLE',
] as const;

export type HandoffPrecheckAnswer = (typeof HANDOFF_PRECHECK_ANSWERS)[number];

export const HANDOFF_SOURCE_TYPES = ['TIMELINE_EVENT', 'TASK'] as const;

export type HandoffSourceType = (typeof HANDOFF_SOURCE_TYPES)[number];

export const HANDOFF_CLINICAL_SECTIONS = [
  'VITAL_SIGNS',
  'RESPIRATION',
  'MENTAL_STATUS',
  'PAIN',
  'TREATMENT',
  'DIET',
  'OBSERVATION',
] as const;

export type HandoffClinicalSection = (typeof HANDOFF_CLINICAL_SECTIONS)[number];

export const HANDOFF_ACKNOWLEDGEMENT_STATUSES = [
  'QUESTIONED',
  'ACKNOWLEDGED',
] as const;

export type HandoffAcknowledgementStatus =
  (typeof HANDOFF_ACKNOWLEDGEMENT_STATUSES)[number];

export const HANDOFF_UNVERIFIED_HANDLINGS = [
  'RESOLVED',
  'KEEP_WITH_WARNING',
] as const;

export type HandoffUnverifiedHandling =
  (typeof HANDOFF_UNVERIFIED_HANDLINGS)[number];

export const HANDOFF_TEMPLATE_IDS = ['NURSING_HANDOFF_V1'] as const;

export type HandoffTemplateId = (typeof HANDOFF_TEMPLATE_IDS)[number];

export const HANDOFF_TARGET_DUTIES = ['DAY', 'EVENING', 'NIGHT'] as const;

export type HandoffTargetDuty = (typeof HANDOFF_TARGET_DUTIES)[number];

export const HANDOFF_JOB_OPERATIONS = {
  PRECHECK: 'handoffs.precheck',
  GENERATE: 'handoffs.generate',
} as const;

export const HANDOFF_JOB_MAX_ATTEMPTS = 3;
export const HANDOFF_JOB_LEASE_MILLISECONDS = 60_000;
export const HANDOFF_DEFAULT_LIST_LIMIT = 20;
export const HANDOFF_MAX_LIST_LIMIT = 100;
