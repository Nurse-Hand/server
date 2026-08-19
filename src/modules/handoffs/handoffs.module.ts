import { Module } from '@nestjs/common';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { TasksModule } from '../tasks/tasks.module';
import { TimelineModule } from '../timeline/timeline.module';
import { HandoffActivityService } from './application/handoff-activity.service';
import { HandoffDraftJobProcessor } from './application/handoff-draft-job.processor';
import { HandoffDraftsService } from './application/handoff-drafts.service';
import { HandoffFinalizationService } from './application/handoff-finalization.service';
import { HandoffPrecheckJobProcessor } from './application/handoff-precheck-job.processor';
import { HandoffPrechecksService } from './application/handoff-prechecks.service';
import { HANDOFF_ACTIVITY_REPOSITORY } from './application/ports/handoff-activity.repository';
import { HANDOFF_DRAFT_AI_GATEWAY } from './application/ports/handoff-draft-ai.gateway';
import { HANDOFF_DRAFT_REPOSITORY } from './application/ports/handoff-draft.repository';
import { HANDOFF_FINALIZATION_REPOSITORY } from './application/ports/handoff-finalization.repository';
import { HANDOFF_PRECHECK_AI_GATEWAY } from './application/ports/handoff-precheck-ai.gateway';
import { HANDOFF_PRECHECK_REPOSITORY } from './application/ports/handoff-precheck.repository';
import { DeterministicHandoffDraftAiGateway } from './infrastructure/ai/deterministic-handoff-draft-ai.gateway';
import { DeterministicHandoffPrecheckAiGateway } from './infrastructure/ai/deterministic-handoff-precheck-ai.gateway';
import { PrismaHandoffActivityRepository } from './infrastructure/prisma-handoff-activity.repository';
import { PrismaHandoffDraftRepository } from './infrastructure/prisma-handoff-draft.repository';
import { PrismaHandoffFinalizationRepository } from './infrastructure/prisma-handoff-finalization.repository';
import { PrismaHandoffPrecheckRepository } from './infrastructure/prisma-handoff-precheck.repository';
import { HandoffAcknowledgementsController } from './presentation/handoff-acknowledgements.controller';
import { HandoffDraftsController } from './presentation/handoff-drafts.controller';
import { HandoffFinalizationController } from './presentation/handoff-finalization.controller';
import { HandoffPrechecksController } from './presentation/handoff-prechecks.controller';

@Module({
  imports: [AiJobsModule, TasksModule, TimelineModule],
  controllers: [
    HandoffPrechecksController,
    HandoffDraftsController,
    HandoffFinalizationController,
    HandoffAcknowledgementsController,
  ],
  providers: [
    HandoffPrechecksService,
    HandoffDraftsService,
    HandoffFinalizationService,
    HandoffActivityService,
    HandoffPrecheckJobProcessor,
    HandoffDraftJobProcessor,
    PrismaHandoffPrecheckRepository,
    PrismaHandoffDraftRepository,
    PrismaHandoffFinalizationRepository,
    PrismaHandoffActivityRepository,
    {
      provide: HANDOFF_PRECHECK_REPOSITORY,
      useExisting: PrismaHandoffPrecheckRepository,
    },
    {
      provide: HANDOFF_DRAFT_REPOSITORY,
      useExisting: PrismaHandoffDraftRepository,
    },
    {
      provide: HANDOFF_FINALIZATION_REPOSITORY,
      useExisting: PrismaHandoffFinalizationRepository,
    },
    {
      provide: HANDOFF_ACTIVITY_REPOSITORY,
      useExisting: PrismaHandoffActivityRepository,
    },
    {
      provide: HANDOFF_PRECHECK_AI_GATEWAY,
      useClass: DeterministicHandoffPrecheckAiGateway,
    },
    {
      provide: HANDOFF_DRAFT_AI_GATEWAY,
      useClass: DeterministicHandoffDraftAiGateway,
    },
  ],
  exports: [HandoffPrecheckJobProcessor, HandoffDraftJobProcessor],
})
export class HandoffsModule {}
