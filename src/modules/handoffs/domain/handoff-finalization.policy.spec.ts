import { assertFinalizationPolicy } from './handoff-finalization.policy';

describe('assertFinalizationPolicy', () => {
  it.each(['RESOLVED', 'KEEP_WITH_WARNING'] as const)(
    'CRITICAL 미응답은 %s로도 우회하지 못한다',
    (handling) => {
      expectPolicyError(
        () =>
          assertFinalizationPolicy(
            [{ severity: 'CRITICAL', answer: null }],
            handling,
          ),
        'HANDOFF_CRITICAL_ANSWER_REQUIRED',
      );
    },
  );

  it('모든 항목에 답변했고 UNVERIFIED가 없으면 RESOLVED만 허용한다', () => {
    const items = [
      { severity: 'CRITICAL' as const, answer: 'NO_ISSUE' as const },
      { severity: 'RECOMMENDED' as const, answer: 'INCLUDE_HANDOFF' as const },
    ];

    expect(assertFinalizationPolicy(items, 'RESOLVED')).toEqual({
      hasWarning: false,
      warningItemIndexes: [],
    });
    expectPolicyError(
      () => assertFinalizationPolicy(items, 'KEEP_WITH_WARNING'),
      'HANDOFF_UNVERIFIED_POLICY_INVALID',
    );
  });

  it.each([
    [[{ severity: 'RECOMMENDED' as const, answer: null }]],
    [[{ severity: 'CRITICAL' as const, answer: 'UNVERIFIED' as const }]],
  ])(
    '미응답 또는 UNVERIFIED가 있으면 KEEP_WITH_WARNING만 허용한다',
    (items) => {
      expect(assertFinalizationPolicy(items, 'KEEP_WITH_WARNING')).toEqual({
        hasWarning: true,
        warningItemIndexes: [0],
      });
      expectPolicyError(
        () => assertFinalizationPolicy(items, 'RESOLVED'),
        'HANDOFF_UNVERIFIED_POLICY_INVALID',
      );
    },
  );
});

function expectPolicyError(action: () => void, code: string): void {
  try {
    action();
    throw new Error('finalization policy error가 발생해야 합니다.');
  } catch (error) {
    expect(error).toMatchObject({ code, kind: 'UNPROCESSABLE_ENTITY' });
  }
}
