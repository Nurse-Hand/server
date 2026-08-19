import { Module } from '@nestjs/common';
import { TIMELINE_READER } from './application/ports/timeline-reader';
import { PrismaTimelineReader } from './infrastructure/prisma-timeline.reader';

@Module({
  providers: [
    PrismaTimelineReader,
    { provide: TIMELINE_READER, useExisting: PrismaTimelineReader },
  ],
  exports: [TIMELINE_READER],
})
export class TimelineModule {}
