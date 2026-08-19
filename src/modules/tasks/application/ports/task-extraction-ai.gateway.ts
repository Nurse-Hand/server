import type { TaskExtractionEvidence } from './task-extraction-evidence.port';

export const TASK_EXTRACTION_AI_GATEWAY = Symbol('TASK_EXTRACTION_AI_GATEWAY');

export type ExtractedTaskCandidate = {
  candidateKey: string;
  patientId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  evidenceSourceIds: readonly string[];
};

export interface TaskExtractionAiGateway {
  extract(input: {
    requestId: string;
    evidence: readonly TaskExtractionEvidence[];
  }): Promise<readonly ExtractedTaskCandidate[]>;
}
