import type { HandoffPrecheckAiInput } from '../../application/ports/handoff-precheck-ai.gateway';
import type { DeterministicHandoffAiScenario } from './deterministic-handoff-ai.options';
import { DeterministicHandoffPrecheckAiGateway } from './deterministic-handoff-precheck-ai.gateway';

const REQUEST_ID = '00000000-0000-4000-8000-000000000701';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const EVENT_ID = '00000000-0000-4000-8000-000000000501';
const TASK_ID = '00000000-0000-4000-8000-000000000601';

describe('DeterministicHandoffPrecheckAiGateway', () => {
  it('동일 snapshot에 근거가 연결된 동일 결과를 생성한다', async () => {
    const gateway = new DeterministicHandoffPrecheckAiGateway();
    const first = await gateway.analyze(input());
    const second = await gateway.analyze(input());

    expect(first).toEqual(second);
    expect(first.questions[0]).toMatchObject({
      patientId: PATIENT_ID,
      severity: 'CRITICAL',
      evidence: expect.arrayContaining([
        {
          sourceType: 'TIMELINE_EVENT',
          sourceId: EVENT_ID,
          patientId: PATIENT_ID,
        },
        { sourceType: 'TASK', sourceId: TASK_ID, patientId: PATIENT_ID },
      ]),
    });
  });

  it.each<{
    scenario: Exclude<DeterministicHandoffAiScenario, 'SUCCESS'>;
    code: string;
    retryable: boolean;
  }>([
    { scenario: 'TIMEOUT', code: 'HANDOFF_AI_TIMEOUT', retryable: true },
    {
      scenario: 'RATE_LIMIT',
      code: 'HANDOFF_AI_RATE_LIMITED',
      retryable: true,
    },
    {
      scenario: 'INVALID_RESPONSE',
      code: 'HANDOFF_AI_INVALID_RESPONSE',
      retryable: false,
    },
    {
      scenario: 'UNAVAILABLE',
      code: 'HANDOFF_AI_UNAVAILABLE',
      retryable: true,
    },
  ])(
    '$scenario을 안전한 실패로 변환한다',
    async ({ scenario, code, retryable }) => {
      await expect(
        new DeterministicHandoffPrecheckAiGateway({ scenario }).analyze(
          input(),
        ),
      ).rejects.toMatchObject({ code, retryable });
    },
  );
});

function input(): HandoffPrecheckAiInput {
  return {
    requestId: REQUEST_ID,
    patients: [
      {
        patientId: PATIENT_ID,
        timelineEvents: [
          {
            id: EVENT_ID,
            occurredAt: new Date('2026-08-18T01:00:00.000Z'),
            type: 'OBSERVATION',
            summary: '체온 상승 관찰',
            sourceReference: 'timeline:event:501',
          },
        ],
        tasks: [
          {
            id: TASK_ID,
            title: '해열 후 체온 재측정',
            dueAt: null,
            effectivePriority: 'CRITICAL',
            version: 1,
            sourceReferences: ['task:601'],
          },
        ],
      },
    ],
  };
}
