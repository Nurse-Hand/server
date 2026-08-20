import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import {
  TIMELINE_EVENT_REPOSITORY,
  type TimelineEventRepository,
} from './ports/timeline-event.repository';
import type { TimelineEventContext } from './timeline-event.models';
import { TimelineEventUpdateInvalidError } from '../domain/timeline.errors';
import type { TimelineEventConfirmationStatus } from '../domain/timeline.types';

type UpdateTimelineEventRequest = {
  version: number;
  summary?: string;
  important?: boolean;
  confirmationStatus?: TimelineEventConfirmationStatus;
};

@Injectable()
export class TimelineEventService {
  constructor(
    @Inject(TIMELINE_EVENT_REPOSITORY)
    private readonly repository: TimelineEventRepository,
    private readonly clock: Clock,
  ) {}

  update(
    context: TimelineEventContext,
    eventId: string,
    body: UpdateTimelineEventRequest,
  ) {
    this.assertUpdateBody(body);
    return this.repository.update({
      context,
      eventId,
      expectedVersion: body.version,
      ...(body.summary === undefined ? {} : { summary: body.summary }),
      ...(body.important === undefined ? {} : { important: body.important }),
      ...(body.confirmationStatus === undefined
        ? {}
        : { confirmationStatus: body.confirmationStatus }),
      now: this.clock.now(),
    });
  }

  history(context: TimelineEventContext, eventId: string) {
    return this.repository.history({
      context,
      eventId,
      now: this.clock.now(),
    });
  }

  private assertUpdateBody(body: UpdateTimelineEventRequest): void {
    if (!Number.isInteger(body.version) || body.version < 1) {
      throw new TimelineEventUpdateInvalidError(
        'version은 1 이상의 정수여야 합니다.',
      );
    }

    if (
      body.summary === undefined &&
      body.important === undefined &&
      body.confirmationStatus === undefined
    ) {
      throw new TimelineEventUpdateInvalidError(
        'version 외에 수정할 Timeline 이벤트 필드가 하나 이상 필요합니다.',
      );
    }
  }
}
