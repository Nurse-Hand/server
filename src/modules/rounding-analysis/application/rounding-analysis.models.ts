export type RoundingAnalysisJobStatus =
  'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

export type RoundingSpeakerRole =
  'NURSE' | 'PATIENT_CANDIDATE' | 'THIRD_PARTY' | 'UNKNOWN';

export type RoundingEvidenceTopic =
  | 'VITAL_SIGNS'
  | 'RESPIRATION'
  | 'MENTAL_STATUS'
  | 'PAIN'
  | 'TREATMENT'
  | 'DIET'
  | 'OBSERVATION';

export type RoundingAnalysisUtteranceReadModel = {
  utteranceId: string;
  speakerLabel: string;
  speakerRole: RoundingSpeakerRole;
  patientId: string | null;
  startedAtMs: number;
  endedAtMs: number;
  text: string;
  confidence: number | null;
  important: boolean;
};

export type RoundingSpeakerMatchReadModel = {
  speakerLabel: string;
  rank: number;
  candidatePatientId: string | null;
  displayName: string;
  similarity: number;
};

export type RoundingAnalysisJobReadModel = {
  jobId: string;
  status: RoundingAnalysisJobStatus;
  roundingSessionId: string;
  audioFileId: string | null;
  fullText: string | null;
  utterances: readonly RoundingAnalysisUtteranceReadModel[];
  speakerMatches: readonly RoundingSpeakerMatchReadModel[];
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RoundingEvidenceReadModel = {
  evidenceId: string;
  patientId: string;
  topic: RoundingEvidenceTopic;
  handoffSection: string;
  keywords: readonly string[];
  importanceFlags: readonly string[];
  requiresNurseConfirmation: boolean;
  textForRetrieval: string;
  sourceUtteranceIds: readonly string[];
  timelineEventId: string | null;
  createdAt: Date;
};

export type RoundingAnalysisConfirmationResult = {
  job: RoundingAnalysisJobReadModel;
  evidences: readonly RoundingEvidenceReadModel[];
  timelineEventIds: readonly string[];
};
