import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  TimelineEventConfirmationStatus,
  TimelineEventSource,
  TimelineEventType,
} from '../domain/timeline.types';

export type TimelineEventContext = DemoSessionContext;

export type TimelineEventDetail = {
  eventId: string;
  patientId: string;
  occurredAt: Date;
  type: TimelineEventType;
  source: TimelineEventSource;
  sourceReference: string;
  summary: string;
  important: boolean;
  confirmationStatus: TimelineEventConfirmationStatus;
  version: number;
  updatedAt: Date;
  updatedByActorId: string | null;
};

export type TimelineEventHistoryItem = {
  historyEntryId: string;
  actorId: string;
  editedAt: Date;
  version: number;
  changes: {
    summary?: { before: string; after: string };
    important?: { before: boolean; after: boolean };
    confirmationStatus?: {
      before: TimelineEventConfirmationStatus;
      after: TimelineEventConfirmationStatus;
    };
  };
};
