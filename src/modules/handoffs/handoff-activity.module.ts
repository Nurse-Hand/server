import { Module } from '@nestjs/common';
import { HandoffActivityService } from './application/handoff-activity.service';
import { HANDOFF_ACTIVITY_REPOSITORY } from './application/ports/handoff-activity.repository';
import { PrismaHandoffActivityRepository } from './infrastructure/prisma-handoff-activity.repository';
import { HandoffAcknowledgementsController } from './presentation/handoff-acknowledgements.controller';

@Module({
  controllers: [HandoffAcknowledgementsController],
  providers: [
    HandoffActivityService,
    PrismaHandoffActivityRepository,
    {
      provide: HANDOFF_ACTIVITY_REPOSITORY,
      useExisting: PrismaHandoffActivityRepository,
    },
  ],
  exports: [HandoffActivityService],
})
export class HandoffActivityModule {}
