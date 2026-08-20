export const QUICK_NOTE_TYPES = [
  'VITAL_SIGNS',
  'RESPIRATION',
  'MENTAL_STATUS',
  'PAIN',
  'TREATMENT',
  'DIET',
  'OBSERVATION',
] as const;

export type QuickNoteType = (typeof QUICK_NOTE_TYPES)[number];

export const QUICK_NOTE_SOURCE_TYPES = ['QUICK_NOTE'] as const;

export type QuickNoteSourceType = (typeof QUICK_NOTE_SOURCE_TYPES)[number];

export const QUICK_NOTE_EVIDENCE_STATUSES = ['PENDING', 'CONVERTED'] as const;

export type QuickNoteEvidenceStatus =
  (typeof QUICK_NOTE_EVIDENCE_STATUSES)[number];
