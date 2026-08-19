import { assertAcknowledgementTransition } from './handoff-acknowledgement.policy';

describe('assertAcknowledgementTransition', () => {
  it.each(['QUESTIONED', 'ACKNOWLEDGED'] as const)(
    '최초 %s 기록을 허용한다',
    (status) => {
      expect(() => assertAcknowledgementTransition(null, status)).not.toThrow();
    },
  );

  it('QUESTIONED 뒤 ACKNOWLEDGED를 허용한다', () => {
    expect(() =>
      assertAcknowledgementTransition('QUESTIONED', 'ACKNOWLEDGED'),
    ).not.toThrow();
  });

  it('같은 상태 반복은 409로 거부한다', () => {
    expectTransitionError(
      () => assertAcknowledgementTransition('QUESTIONED', 'QUESTIONED'),
      'HANDOFF_ACKNOWLEDGEMENT_DUPLICATE',
      'CONFLICT',
    );
  });

  it('ACKNOWLEDGED 뒤 QUESTIONED는 422로 거부한다', () => {
    expectTransitionError(
      () => assertAcknowledgementTransition('ACKNOWLEDGED', 'QUESTIONED'),
      'HANDOFF_ACKNOWLEDGEMENT_TRANSITION_INVALID',
      'UNPROCESSABLE_ENTITY',
    );
  });
});

function expectTransitionError(
  action: () => void,
  code: string,
  kind: 'CONFLICT' | 'UNPROCESSABLE_ENTITY',
): void {
  try {
    action();
    throw new Error('acknowledgement transition error가 발생해야 합니다.');
  } catch (error) {
    expect(error).toMatchObject({ code, kind });
  }
}
