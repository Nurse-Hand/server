import { Injectable } from '@nestjs/common';
import type {
  ExtractedTaskCandidate,
  TaskExtractionAiGateway,
} from '../application/ports/task-extraction-ai.gateway';

@Injectable()
export class DeterministicTaskExtractionAiAdapter implements TaskExtractionAiGateway {
  extract(input: {
    evidence: readonly {
      sourceId: string;
      patientId: string | null;
    }[];
  }): Promise<readonly ExtractedTaskCandidate[]> {
    return Promise.resolve(
      input.evidence.map((evidence, index) => ({
        candidateKey: `candidate-${index + 1}`,
        patientId: evidence.patientId,
        title: `라운딩 후속 업무 ${index + 1}`,
        description: null,
        dueAt: null,
        evidenceSourceIds: [evidence.sourceId],
      })),
    );
  }
}
