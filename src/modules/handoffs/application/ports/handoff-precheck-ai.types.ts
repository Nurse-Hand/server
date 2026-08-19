export type HandoffPrecheckAiSourceType = 'TIMELINE_EVENT' | 'TASK';

export type HandoffPrecheckAiEvidenceReference = {
  sourceType: HandoffPrecheckAiSourceType;
  sourceId: string;
  patientId: string;
};

export type HandoffPrecheckAiPatientInput = {
  patientId: string;
  timelineEvents: readonly {
    id: string;
    occurredAt: Date;
    type: 'OBSERVATION' | 'MEDICATION' | 'PROCEDURE' | 'REPORT' | 'TASK';
    summary: string;
    sourceReference: string;
  }[];
  tasks: readonly {
    id: string;
    title: string;
    dueAt: Date | null;
    effectivePriority: 'CRITICAL' | 'HIGH' | 'NORMAL';
    version: number;
    sourceReferences: readonly string[];
  }[];
};

export type HandoffPrecheckAiResult = {
  requestId: string;
  modelVersion: string;
  contractVersion: string;
  generatedAt: Date;
  questions: readonly {
    questionKey: string;
    patientId: string;
    severity: 'CRITICAL' | 'RECOMMENDED';
    prompt: string;
    reason: string;
    evidence: readonly HandoffPrecheckAiEvidenceReference[];
  }[];
};
