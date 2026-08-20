import { parseTaskPrioritySuggestionResponse } from './task-priority-suggestion-response.parser';

const REQUEST_ID = '00000000-0000-4000-8000-000000000701';
const TASK_ID_A = '00000000-0000-4000-8000-000000000601';
const TASK_ID_B = '00000000-0000-4000-8000-000000000602';
const UNKNOWN_TASK_ID = '00000000-0000-4000-8000-000000000699';

describe('parseTaskPrioritySuggestionResponse', () => {
  it('현재 AI 계약을 변환하고 같은 batch 안에서 score와 taskId로 정렬한다', () => {
    const result = parseTaskPrioritySuggestionResponse(
      response({
        results: [
          aiResult({ taskId: TASK_ID_B, score: 10, priority: 'NORMAL' }),
          aiResult({ taskId: TASK_ID_A, score: 10, priority: 'CRITICAL' }),
        ],
      }),
      input(),
    );

    expect(result).toEqual({
      requestId: REQUEST_ID,
      suggestions: [
        {
          taskId: TASK_ID_A,
          aiScore: 10,
          aiSuggestedPriority: 'CRITICAL',
          reasons: ['현재 업무 확인이 필요함'],
        },
        {
          taskId: TASK_ID_B,
          aiScore: 10,
          aiSuggestedPriority: 'NORMAL',
          reasons: ['현재 업무 확인이 필요함'],
        },
      ],
    });
  });

  it.each([
    ['requestId 불일치', response({ requestId: UNKNOWN_TASK_ID })],
    ['누락 task', response({ results: [aiResult({ taskId: TASK_ID_A })] })],
    [
      '중복 task',
      response({
        results: [
          aiResult({ taskId: TASK_ID_A }),
          aiResult({ taskId: TASK_ID_A }),
        ],
      }),
    ],
    [
      '알 수 없는 task',
      response({
        results: [
          aiResult({ taskId: TASK_ID_A }),
          aiResult({ taskId: UNKNOWN_TASK_ID }),
        ],
      }),
    ],
    ['음수 score', response({ results: results({ score: -1 }) })],
    [
      '무한 score',
      response({ results: results({ score: Number.POSITIVE_INFINITY }) }),
    ],
    ['지원하지 않는 enum', response({ results: results({ priority: 'LOW' }) })],
    [
      'reason 6개',
      response({ results: results({ reasons: Array(6).fill('reason') }) }),
    ],
    [
      'reason 201자',
      response({ results: results({ reasons: ['a'.repeat(201)] }) }),
    ],
    ['추가 필드', response({ unexpected: true })],
  ])('%s 응답은 batch 전체를 거부한다', (_label, value) => {
    expect(() => parseTaskPrioritySuggestionResponse(value, input())).toThrow(
      'TASK_AI_RESPONSE_INVALID',
    );
  });
});

function input() {
  return { requestId: REQUEST_ID, taskIds: [TASK_ID_A, TASK_ID_B] };
}

function aiResult(overrides: Record<string, unknown> = {}) {
  return {
    taskId: TASK_ID_A,
    score: 10,
    priority: 'CRITICAL',
    reasons: ['현재 업무 확인이 필요함'],
    ...overrides,
  };
}

function results(overrides: Record<string, unknown> = {}) {
  return [
    aiResult({ taskId: TASK_ID_A, ...overrides }),
    aiResult({ taskId: TASK_ID_B }),
  ];
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    results: results(),
    ...overrides,
  };
}
