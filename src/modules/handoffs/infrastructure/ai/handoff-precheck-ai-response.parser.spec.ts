import type { HandoffPrecheckAiInput } from '../../application/ports/handoff-precheck-ai.gateway';
import { parseHandoffPrecheckAiResponse } from './handoff-precheck-ai-response.parser';

const REQUEST_ID = '00000000-0000-4000-8000-000000000701';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const EVENT_ID = '00000000-0000-4000-8000-000000000501';
const TASK_ID = '00000000-0000-4000-8000-000000000601';
const FOREIGN_ID = '00000000-0000-4000-8000-000000000999';

describe('parseHandoffPrecheckAiResponse', () => {
  it('입력 snapshot에 속한 Timeline과 Task 근거만 parsing한다', () => {
    const result = parseHandoffPrecheckAiResponse(response(), input());

    expect(result.generatedAt).toEqual(new Date('2026-08-18T02:00:00.000Z'));
    expect(result.questions[0].evidence).toEqual([
      {
        sourceType: 'TIMELINE_EVENT',
        sourceId: EVENT_ID,
        patientId: PATIENT_ID,
      },
      { sourceType: 'TASK', sourceId: TASK_ID, patientId: PATIENT_ID },
    ]);
  });

  it.each([
    [
      '없는 source',
      { sourceType: 'TASK', sourceId: FOREIGN_ID, patientId: PATIENT_ID },
    ],
    [
      '다른 patient',
      { sourceType: 'TASK', sourceId: TASK_ID, patientId: FOREIGN_ID },
    ],
  ])('%s 근거가 있으면 결과 전체를 거부한다', (_label, evidence) => {
    expect(() =>
      parseHandoffPrecheckAiResponse(
        response({ questions: [{ ...question(), evidence: [evidence] }] }),
        input(),
      ),
    ).toThrow('HANDOFF_AI_INVALID_RESPONSE');
  });

  it('계약에 없는 추가 필드를 거부한다', () => {
    expect(() =>
      parseHandoffPrecheckAiResponse(response({ unexpected: true }), input()),
    ).toThrow('HANDOFF_AI_INVALID_RESPONSE');
  });
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

function question() {
  return {
    questionKey: 'patient-precheck',
    patientId: PATIENT_ID,
    severity: 'CRITICAL',
    prompt: '현재 체온을 확인해 주세요.',
    reason: '관찰 기록과 미완료 업무가 있습니다.',
    evidence: [
      {
        sourceType: 'TIMELINE_EVENT',
        sourceId: EVENT_ID,
        patientId: PATIENT_ID,
      },
      { sourceType: 'TASK', sourceId: TASK_ID, patientId: PATIENT_ID },
    ],
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    modelVersion: 'model-v1',
    contractVersion: 'handoff-precheck-v1',
    generatedAt: '2026-08-18T02:00:00.000Z',
    questions: [question()],
    ...overrides,
  };
}
