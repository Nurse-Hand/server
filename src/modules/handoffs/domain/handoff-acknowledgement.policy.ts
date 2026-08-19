import type { HandoffAcknowledgementStatus } from './handoff.constants';
import {
  HandoffAcknowledgementDuplicateError,
  HandoffAcknowledgementTransitionError,
} from './handoff.errors';

export function assertAcknowledgementTransition(
  latest: HandoffAcknowledgementStatus | null,
  requested: HandoffAcknowledgementStatus,
): void {
  if (latest === requested) {
    throw new HandoffAcknowledgementDuplicateError();
  }

  if (latest === 'ACKNOWLEDGED') {
    throw new HandoffAcknowledgementTransitionError();
  }
}
