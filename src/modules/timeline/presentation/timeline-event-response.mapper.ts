import type {
  TimelineEventDetail,
  TimelineEventHistoryItem,
} from '../application/timeline-event.models';
import type {
  TimelineEventDataDto,
  TimelineEventHistoryDataDto,
} from './timeline-event.dto';

export function toTimelineEventDataDto(
  event: TimelineEventDetail,
): TimelineEventDataDto {
  return {
    eventId: event.eventId,
    patientId: event.patientId,
    occurredAt: event.occurredAt.toISOString(),
    type: event.type,
    ...(event.clinicalCategory === null
      ? {}
      : { clinicalCategory: event.clinicalCategory }),
    source: event.source,
    sourceReference: event.sourceReference,
    summary: event.summary,
    important: event.important,
    confirmationStatus: event.confirmationStatus,
    version: event.version,
    updatedAt: event.updatedAt.toISOString(),
    updatedByActorId: event.updatedByActorId,
  };
}

export function toTimelineEventHistoryDataDto(
  items: readonly TimelineEventHistoryItem[],
): TimelineEventHistoryDataDto {
  return {
    items: items.map((item) => ({
      historyEntryId: item.historyEntryId,
      actorId: item.actorId,
      editedAt: item.editedAt.toISOString(),
      version: item.version,
      changes: {
        ...(item.changes.summary === undefined
          ? {}
          : { summary: item.changes.summary }),
        ...(item.changes.important === undefined
          ? {}
          : { important: item.changes.important }),
        ...(item.changes.confirmationStatus === undefined
          ? {}
          : { confirmationStatus: item.changes.confirmationStatus }),
      },
    })),
  };
}
