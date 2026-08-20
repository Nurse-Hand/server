import type { ExtractedTaskCandidate } from '../application/ports/task-extraction-ai.gateway';
import type { TaskPriorityAiGateway } from '../application/ports/task-priority-ai.gateway';
import { DeterministicTaskPriorityAiAdapter } from './deterministic-task-priority-ai.adapter';

describe('DeterministicTaskPriorityAiAdapter', () => {
  const gateway: TaskPriorityAiGateway =
    new DeterministicTaskPriorityAiAdapter();

  it('테스트 환경용 NORMAL 제안, 이유, confidence와 근거를 반환한다', async () => {
    const candidate = createCandidate();
    const [suggestion] = await gateway.prioritize({
      requestId: '00000000-0000-4000-8000-000000000701',
      candidates: [candidate],
    });

    expect(suggestion).toEqual({
      candidateKey: candidate.candidateKey,
      suggestedPriority: 'NORMAL',
      reasons: ['테스트 환경의 결정론적 업무 우선순위 제안입니다.'],
      confidence: 'MEDIUM',
      evidenceSourceIds: candidate.evidenceSourceIds,
    });
  });

  it('빈 후보에는 우선순위 제안을 만들지 않는다', async () => {
    await expect(
      gateway.prioritize({
        requestId: '00000000-0000-4000-8000-000000000701',
        candidates: [],
      }),
    ).resolves.toEqual([]);
  });
});

function createCandidate(
  overrides: Partial<ExtractedTaskCandidate> = {},
): ExtractedTaskCandidate {
  return {
    candidateKey: 'candidate-1',
    patientId: null,
    title: '라운딩 후속 업무 1',
    description: null,
    dueAt: null,
    evidenceSourceIds: ['00000000-0000-4000-8000-000000000501'],
    ...overrides,
  };
}
