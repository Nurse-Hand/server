import { Module } from '@nestjs/common';
import { HandoffFinalizationService } from './application/handoff-finalization.service';
import { HANDOFF_FINALIZATION_REPOSITORY } from './application/ports/handoff-finalization.repository';
import { PrismaHandoffFinalizationRepository } from './infrastructure/prisma-handoff-finalization.repository';
import { HandoffFinalizationController } from './presentation/handoff-finalization.controller';

@Module({
  controllers: [HandoffFinalizationController],
  providers: [
    HandoffFinalizationService,
    PrismaHandoffFinalizationRepository,
    {
      provide: HANDOFF_FINALIZATION_REPOSITORY,
      useExisting: PrismaHandoffFinalizationRepository,
    },
  ],
  exports: [HandoffFinalizationService],
})
export class HandoffFinalizationModule {}
