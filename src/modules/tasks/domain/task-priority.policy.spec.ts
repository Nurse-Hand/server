import {
  calculateTaskRulePriority,
  compareTaskPrioritySuggestions,
  compareTaskOrdering,
  getEffectiveTaskPriority,
  mapAiTaskPriority,
  type TaskOrderingValue,
} from './task-priority.policy';

const NOW = new Date('2026-08-19T00:00:00.000Z');
const DUTY_ENDS_AT = new Date('2026-08-19T07:00:00.000Z');

describe('task priority policy', () => {
  describe('calculateTaskRulePriority', () => {
    it.each([
      {
        label: '마감이 1ms 지났을 때',
        dueAt: new Date(NOW.getTime() - 1),
        expected: 'CRITICAL',
      },
      {
        label: '마감이 현재 시각과 같을 때',
        dueAt: new Date(NOW),
        expected: 'HIGH',
      },
      {
        label: '마감이 현재 근무 종료 시각과 같을 때',
        dueAt: new Date(DUTY_ENDS_AT),
        expected: 'HIGH',
      },
      {
        label: '마감이 현재 근무 종료보다 1ms 늦을 때',
        dueAt: new Date(DUTY_ENDS_AT.getTime() + 1),
        expected: 'NORMAL',
      },
      {
        label: '마감이 없을 때',
        dueAt: null,
        expected: 'NORMAL',
      },
    ] as const)('$label $expected을 반환한다', ({ dueAt, expected }) => {
      expect(
        calculateTaskRulePriority({
          dueAt,
          now: NOW,
          currentDutyEndsAt: DUTY_ENDS_AT,
        }),
      ).toBe(expected);
    });
  });

  it('간호사 확정값이 있으면 규칙값보다 우선하고 해제되면 규칙값으로 돌아간다', () => {
    expect(getEffectiveTaskPriority('NORMAL', 'CRITICAL')).toBe('CRITICAL');
    expect(getEffectiveTaskPriority('HIGH', null)).toBe('HIGH');
  });

  it('AI enum을 참고 제안 enum으로만 변환한다', () => {
    expect(mapAiTaskPriority('CRITICAL')).toBe('CRITICAL');
    expect(mapAiTaskPriority('HIGH')).toBe('HIGH');
    expect(mapAiTaskPriority('NORMAL')).toBe('NORMAL');
  });

  it('같은 batch의 참고 제안만 score 내림차순과 taskId로 안정 정렬한다', () => {
    const suggestions = [
      { taskId: 'task-b', aiScore: 10 },
      { taskId: 'task-c', aiScore: 20 },
      { taskId: 'task-a', aiScore: 10 },
    ];

    suggestions.sort(compareTaskPrioritySuggestions);

    expect(suggestions.map(({ taskId }) => taskId)).toEqual([
      'task-c',
      'task-a',
      'task-b',
    ]);
  });

  it('미확정 AI 제안은 effectivePriority와 실제 priority 정렬에 영향을 주지 않는다', () => {
    const tasks = [
      {
        ...orderingValue({
          id: '00000000-0000-4000-8000-000000000002',
          effectivePriority: getEffectiveTaskPriority('NORMAL', null),
        }),
        aiSuggestedPriority: 'CRITICAL' as const,
      },
      {
        ...orderingValue({
          id: '00000000-0000-4000-8000-000000000001',
          effectivePriority: getEffectiveTaskPriority('HIGH', null),
        }),
        aiSuggestedPriority: 'NORMAL' as const,
      },
    ];

    tasks.sort((left, right) => compareTaskOrdering(left, right, 'priority'));

    expect(tasks.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
  });

  it('priority 정렬은 priority, dueAt NULLS LAST, createdAt, id 순으로 안정적이다', () => {
    const tasks: TaskOrderingValue[] = [
      orderingValue({
        id: '00000000-0000-4000-8000-000000000006',
        effectivePriority: 'HIGH',
        dueAt: null,
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000005',
        effectivePriority: 'HIGH',
        dueAt: new Date('2026-08-19T03:00:00.000Z'),
        createdAt: new Date('2026-08-19T00:00:01.000Z'),
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000004',
        effectivePriority: 'HIGH',
        dueAt: new Date('2026-08-19T03:00:00.000Z'),
        createdAt: new Date('2026-08-19T00:00:01.000Z'),
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000003',
        effectivePriority: 'HIGH',
        dueAt: new Date('2026-08-19T03:00:00.000Z'),
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000002',
        effectivePriority: 'HIGH',
        dueAt: new Date('2026-08-19T02:00:00.000Z'),
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000001',
        effectivePriority: 'CRITICAL',
        dueAt: null,
      }),
    ];

    tasks.sort((left, right) => compareTaskOrdering(left, right, 'priority'));

    expect(tasks.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000006',
    ]);
  });

  it('dueAt 정렬도 NULLS LAST와 모든 tie-breaker를 고정한다', () => {
    const tasks: TaskOrderingValue[] = [
      orderingValue({
        id: '00000000-0000-4000-8000-000000000004',
        dueAt: null,
        effectivePriority: 'CRITICAL',
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000003',
        dueAt: new Date('2026-08-19T02:00:00.000Z'),
        effectivePriority: 'NORMAL',
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000002',
        dueAt: new Date('2026-08-19T02:00:00.000Z'),
        effectivePriority: 'HIGH',
        createdAt: new Date('2026-08-19T00:00:01.000Z'),
      }),
      orderingValue({
        id: '00000000-0000-4000-8000-000000000001',
        dueAt: new Date('2026-08-19T02:00:00.000Z'),
        effectivePriority: 'HIGH',
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
      }),
    ];

    tasks.sort((left, right) => compareTaskOrdering(left, right, 'dueAt'));

    expect(tasks.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
    ]);
  });
});

function orderingValue(
  overrides: Partial<TaskOrderingValue> = {},
): TaskOrderingValue {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    dueAt: new Date('2026-08-19T02:00:00.000Z'),
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    effectivePriority: 'NORMAL',
    ...overrides,
  };
}
