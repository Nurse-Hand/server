import { Injectable } from '@nestjs/common';
import type { ExtractedTaskCandidate } from '../application/ports/task-extraction-ai.gateway';
import type {
  TaskPriorityAiGateway,
  TaskPrioritySuggestion,
} from '../application/ports/task-priority-ai.gateway';

@Injectable()
export class DeterministicTaskPriorityAiAdapter implements TaskPriorityAiGateway {
  prioritize(input: {
    candidates: readonly ExtractedTaskCandidate[];
  }): Promise<readonly TaskPrioritySuggestion[]> {
    return Promise.resolve(
      input.candidates.map((candidate) => ({
        candidateKey: candidate.candidateKey,
        suggestedPriority: 'NORMAL' as const,
        reasons: ['라운딩 기록에서 후속 업무 후보로 확인됨'],
        confidence: 'MEDIUM' as const,
        evidenceSourceIds: [...candidate.evidenceSourceIds],
      })),
    );
  }
}
