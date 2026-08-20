export const TIMELINE_EVENT_TYPES = [
  'OBSERVATION',
  'MEDICATION',
  'PROCEDURE',
  'REPORT',
  'TASK',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const TIMELINE_CLINICAL_CATEGORIES = [
  'VITAL_SIGNS',
  'RESPIRATION',
  'MENTAL_STATUS',
  'PAIN',
  'TREATMENT',
  'DIET',
  'OBSERVATION',
] as const;

export type TimelineClinicalCategory =
  (typeof TIMELINE_CLINICAL_CATEGORIES)[number];

export const TIMELINE_EVENT_SOURCES = ['MANUAL', 'AI_AUDIO'] as const;

export type TimelineEventSource = (typeof TIMELINE_EVENT_SOURCES)[number];

export const TIMELINE_EVENT_CONFIRMATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
] as const;

export type TimelineEventConfirmationStatus =
  (typeof TIMELINE_EVENT_CONFIRMATION_STATUSES)[number];
