import type { HandoffHistoryCursor } from '../../domain/handoff-history-cursor';
import type {
  CreateHandoffAcknowledgementCommand,
  CreatedHandoffAcknowledgement,
  HandoffActivityContext,
  HandoffHistoryPage,
} from '../handoff-activity.models';

export const HANDOFF_ACTIVITY_REPOSITORY = Symbol(
  'HANDOFF_ACTIVITY_REPOSITORY',
);

export interface HandoffActivityRepository {
  acknowledge(
    input: CreateHandoffAcknowledgementCommand,
  ): Promise<CreatedHandoffAcknowledgement>;

  history(input: {
    context: HandoffActivityContext;
    handoffId: string;
    cursor?: HandoffHistoryCursor;
    limit: number;
    viewedAt: Date;
  }): Promise<HandoffHistoryPage>;
}
