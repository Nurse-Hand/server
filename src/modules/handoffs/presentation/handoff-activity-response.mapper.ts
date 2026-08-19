import type {
  CreatedHandoffAcknowledgement,
  HandoffHistoryEvent,
} from '../application/handoff-activity.models';
import type {
  HandoffAcknowledgementDataDto,
  HandoffHistoryEventDto,
} from './handoff-activity.dto';

export function toHandoffAcknowledgementData(
  value: CreatedHandoffAcknowledgement,
): HandoffAcknowledgementDataDto {
  return { ...value, acknowledgedAt: value.acknowledgedAt.toISOString() };
}
export function toHandoffHistoryEvents(
  values: readonly HandoffHistoryEvent[],
): HandoffHistoryEventDto[] {
  return values.map((value) => {
    const { warningItemIds, ...metadata } = value.metadata;
    return {
      eventId: value.eventId,
      type: value.type,
      actorId: value.actorId,
      occurredAt: value.occurredAt.toISOString(),
      metadata: {
        ...metadata,
        ...(warningItemIds === undefined
          ? {}
          : { warningItemIds: [...warningItemIds] }),
      },
    };
  });
}
