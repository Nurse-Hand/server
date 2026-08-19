import type { ExtractedTaskCandidate } from '../application/ports/task-extraction-ai.gateway';
import type { TaskPriorityAiGateway } from '../application/ports/task-priority-ai.gateway';
import { TASK_AI_CONFIDENCES } from '../domain/task.types';
import { DeterministicTaskPriorityAiAdapter } from './deterministic-task-priority-ai.adapter';

describe('DeterministicTaskPriorityAiAdapter', () => {
  const gateway: TaskPriorityAiGateway =
    new DeterministicTaskPriorityAiAdapter();

  it('후보별 NORMAL 제안, 이유, categorical confidence와 근거를 반환한다', async () => {
    const candidate = createCandidate();
    const [suggestion] = await gateway.prioritize({
      requestId: '00000000-0000-4000-8000-000000000701',
      candidates: [candidate],
    });

    expect(suggestion).toEqual({
      candidateKey: candidate.candidateKey,
      suggestedPriority: 'NORMAL',
      reasons: ['라운딩 기록에서 후속 업무 후보로 확인됨'],
      confidence: 'MEDIUM',
      evidenceSourceIds: candidate.evidenceSourceIds,
    });
    expect(TASK_AI_CONFIDENCES).toContain(suggestion.confidence);
    expect(typeof suggestion.confidence).toBe('string');
  });

  it('동일 후보에는 request ID와 무관하게 동일한 제안을 반환한다', async () => {
    const candidates = [createCandidate()];
    const first = await gateway.prioritize({
      requestId: '00000000-0000-4000-8000-000000000701',
      candidates,
    });
    const second = await gateway.prioritize({
      requestId: '00000000-0000-4000-8000-000000000702',
      candidates,
    });

    expect(second).toEqual(first);
  });

  it('근거 배열을 복사해 입력 후보를 변경하지 않는다', async () => {
    const evidenceSourceIds = ['00000000-0000-4000-8000-000000000501'];
    const candidate = createCandidate({ evidenceSourceIds });
    const [suggestion] = await gateway.prioritize({
      requestId: '00000000-0000-4000-8000-000000000701',
      candidates: [candidate],
    });

    expect(suggestion.evidenceSourceIds).toEqual(evidenceSourceIds);
    expect(suggestion.evidenceSourceIds).not.toBe(evidenceSourceIds);
  });

  it('빈 후보에는 우선순위 제안을 만들어내지 않는다', async () => {
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
