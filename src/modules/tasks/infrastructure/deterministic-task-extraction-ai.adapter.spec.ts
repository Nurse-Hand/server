import type { TaskExtractionAiGateway } from '../application/ports/task-extraction-ai.gateway';
import type { TaskExtractionEvidence } from '../application/ports/task-extraction-evidence.port';
import { DeterministicTaskExtractionAiAdapter } from './deterministic-task-extraction-ai.adapter';

describe('DeterministicTaskExtractionAiAdapter', () => {
  const gateway: TaskExtractionAiGateway =
    new DeterministicTaskExtractionAiAdapter();

  it('evidence 순서와 연결 ID를 보존한 결정론적 후보를 만든다', async () => {
    const evidence = [
      createEvidence({
        sourceId: '00000000-0000-4000-8000-000000000501',
        patientId: '00000000-0000-4000-8000-000000000601',
      }),
      createEvidence({
        sourceId: '00000000-0000-4000-8000-000000000502',
        patientId: null,
      }),
    ];

    await expect(
      gateway.extract({
        requestId: '00000000-0000-4000-8000-000000000701',
        evidence,
      }),
    ).resolves.toEqual([
      {
        candidateKey: 'candidate-1',
        patientId: '00000000-0000-4000-8000-000000000601',
        title: '라운딩 후속 업무 1',
        description: null,
        dueAt: null,
        evidenceSourceIds: ['00000000-0000-4000-8000-000000000501'],
      },
      {
        candidateKey: 'candidate-2',
        patientId: null,
        title: '라운딩 후속 업무 2',
        description: null,
        dueAt: null,
        evidenceSourceIds: ['00000000-0000-4000-8000-000000000502'],
      },
    ]);
  });

  it('동일 evidence에는 request ID와 무관하게 같은 후보를 반환한다', async () => {
    const evidence = [createEvidence()];
    const first = await gateway.extract({
      requestId: '00000000-0000-4000-8000-000000000701',
      evidence,
    });
    const second = await gateway.extract({
      requestId: '00000000-0000-4000-8000-000000000702',
      evidence,
    });

    expect(second).toEqual(first);
  });

  it('빈 evidence에는 후보를 만들어내지 않는다', async () => {
    await expect(
      gateway.extract({
        requestId: '00000000-0000-4000-8000-000000000701',
        evidence: [],
      }),
    ).resolves.toEqual([]);
  });
});

function createEvidence(
  overrides: Partial<TaskExtractionEvidence> = {},
): TaskExtractionEvidence {
  return {
    recordId: '00000000-0000-4000-8000-000000000501',
    sourceType: 'TIMELINE_EVENT',
    sourceId: '00000000-0000-4000-8000-000000000501',
    patientId: null,
    workDate: new Date('2026-08-19T00:00:00.000Z'),
    summary: 'Synthetic rounding evidence',
    ...overrides,
  };
}
