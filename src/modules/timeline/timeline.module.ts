import { Module } from '@nestjs/common';
import { TimelineEventService } from './application/timeline-event.service';
import { TIMELINE_EVENT_REPOSITORY } from './application/ports/timeline-event.repository';
import { TIMELINE_READER } from './application/ports/timeline-reader';
import { PrismaTimelineEventRepository } from './infrastructure/prisma-timeline-event.repository';
import { PrismaTimelineReader } from './infrastructure/prisma-timeline.reader';
import { TimelineEventsController } from './presentation/timeline-events.controller';

@Module({
  controllers: [TimelineEventsController],
  providers: [
    PrismaTimelineReader,
    PrismaTimelineEventRepository,
    TimelineEventService,
    { provide: TIMELINE_READER, useExisting: PrismaTimelineReader },
    {
      provide: TIMELINE_EVENT_REPOSITORY,
      useExisting: PrismaTimelineEventRepository,
    },
  ],
  exports: [TIMELINE_READER],
})
export class TimelineModule {}
