import type {
  TimelineEventContext,
  TimelineEventDetail,
  TimelineEventHistoryItem,
} from '../timeline-event.models';
import type { TimelineEventConfirmationStatus } from '../../domain/timeline.types';

export const TIMELINE_EVENT_REPOSITORY = Symbol('TIMELINE_EVENT_REPOSITORY');

export type UpdateTimelineEventCommand = {
  context: TimelineEventContext;
  eventId: string;
  expectedVersion: number;
  summary?: string;
  important?: boolean;
  confirmationStatus?: TimelineEventConfirmationStatus;
  now: Date;
};

export interface TimelineEventRepository {
  update(command: UpdateTimelineEventCommand): Promise<TimelineEventDetail>;
  history(input: {
    context: TimelineEventContext;
    eventId: string;
    now: Date;
  }): Promise<readonly TimelineEventHistoryItem[]>;
}
