import type { HandoffClinicalSection } from '../../domain/handoff.constants';

export type HandoffDraftAiEvidenceReference = {
  sourceType: 'TIMELINE_EVENT' | 'TASK';
  sourceId: string;
  patientId: string;
};

export type HandoffDraftAiPatientInput = {
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

export type HandoffDraftAiPrecheckItemInput = {
  id: string;
  severity: 'CRITICAL' | 'RECOMMENDED';
  question: string;
  answer:
    'NO_ISSUE' | 'INCLUDE_HANDOFF' | 'UNVERIFIED' | 'NOT_APPLICABLE' | null;
  evidence: readonly HandoffDraftAiEvidenceReference[];
};

export type HandoffDraftAiResult = {
  requestId: string;
  modelVersion: string;
  contractVersion: string;
  generatedAt: Date;
  patients: readonly {
    patientId: string;
    sections: readonly {
      section: HandoffClinicalSection;
      content: string;
      citations: readonly HandoffDraftAiEvidenceReference[];
    }[];
  }[];
  warnings: readonly {
    code: 'UNVERIFIED_INFORMATION';
    itemId: string;
    patientId: string;
    message: string;
    evidence: readonly HandoffDraftAiEvidenceReference[];
  }[];
};
