import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  HandoffAcknowledgementStatus,
  HandoffUnverifiedHandling,
} from '../domain/handoff.constants';

export type HandoffActivityContext = DemoSessionContext;

export const HANDOFF_HISTORY_EVENT_TYPES = [
  'CREATED',
  'GENERATION_RETRIED',
  'DRAFT_GENERATED',
  'DRAFT_UPDATED',
  'FINALIZED',
  'VIEWED',
  'QUESTIONED',
  'ACKNOWLEDGED',
] as const;

export type HandoffHistoryEventType =
  (typeof HANDOFF_HISTORY_EVENT_TYPES)[number];

export type HandoffHistoryMetadata = {
  generationSequence?: number;
  version?: number;
  unverifiedHandling?: HandoffUnverifiedHandling;
  warningItemIds?: readonly string[];
  status?: HandoffAcknowledgementStatus;
};

export type HandoffHistoryEvent = {
  eventId: string;
  type: HandoffHistoryEventType;
  actorId: string;
  occurredAt: Date;
  metadata: HandoffHistoryMetadata;
};

export type HandoffHistoryPage = {
  items: readonly HandoffHistoryEvent[];
  nextCursor: string | null;
};

export type CreateHandoffAcknowledgementCommand = {
  context: HandoffActivityContext;
  handoffId: string;
  status: HandoffAcknowledgementStatus;
  comment: string | null;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  now: Date;
};

export type CreatedHandoffAcknowledgement = {
  acknowledgementId: string;
  status: HandoffAcknowledgementStatus;
  acknowledgedAt: Date;
};
