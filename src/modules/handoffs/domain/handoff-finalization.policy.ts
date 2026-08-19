import type {
  HandoffPrecheckAnswer,
  HandoffPrecheckSeverity,
  HandoffUnverifiedHandling,
} from './handoff.constants';
import {
  HandoffCriticalAnswerRequiredError,
  HandoffUnverifiedPolicyInvalidError,
} from './handoff.errors';

export type FinalizationAnswerState = {
  severity: HandoffPrecheckSeverity;
  answer: HandoffPrecheckAnswer | null;
};

export type FinalizationWarningState = {
  hasWarning: boolean;
  warningItemIndexes: readonly number[];
};

export function assertFinalizationPolicy(
  items: readonly FinalizationAnswerState[],
  handling: HandoffUnverifiedHandling,
): FinalizationWarningState {
  if (
    items.some(
      ({ severity, answer }) => severity === 'CRITICAL' && answer === null,
    )
  ) {
    throw new HandoffCriticalAnswerRequiredError();
  }

  const warningItemIndexes = items.flatMap(({ answer }, index) =>
    answer === null || answer === 'UNVERIFIED' ? [index] : [],
  );
  const hasWarning = warningItemIndexes.length > 0;

  if (
    (handling === 'RESOLVED' && hasWarning) ||
    (handling === 'KEEP_WITH_WARNING' && !hasWarning)
  ) {
    throw new HandoffUnverifiedPolicyInvalidError();
  }

  return { hasWarning, warningItemIndexes };
}
