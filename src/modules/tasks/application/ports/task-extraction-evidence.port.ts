import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type { TaskEvidenceSourceType } from '../../domain/task.types';

export const TASK_EXTRACTION_EVIDENCE_PORT = Symbol(
  'TASK_EXTRACTION_EVIDENCE_PORT',
);

export type TaskExtractionEvidence = {
  recordId: string;
  sourceType: TaskEvidenceSourceType;
  sourceId: string;
  patientId: string | null;
  workDate: Date;
  summary: string;
};

export type TaskExtractionEvidenceSnapshot = {
  roundingSessionId: string;
  evidence: readonly TaskExtractionEvidence[];
};

export interface TaskExtractionEvidencePort {
  read(input: {
    context: DemoSessionContext;
    roundingSessionId: string;
    recordIds: readonly string[];
  }): Promise<TaskExtractionEvidenceSnapshot>;
}
