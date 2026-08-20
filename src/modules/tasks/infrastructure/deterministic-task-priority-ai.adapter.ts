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
        reasons: ['테스트 환경의 결정론적 업무 우선순위 제안입니다.'],
        confidence: 'MEDIUM' as const,
        evidenceSourceIds: [...candidate.evidenceSourceIds],
      })),
    );
  }
}
