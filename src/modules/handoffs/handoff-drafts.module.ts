import { Module } from '@nestjs/common';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { TasksModule } from '../tasks/tasks.module';
import { TimelineModule } from '../timeline/timeline.module';
import { HandoffDraftJobProcessor } from './application/handoff-draft-job.processor';
import { HandoffDraftsService } from './application/handoff-drafts.service';
import { HANDOFF_DRAFT_AI_GATEWAY } from './application/ports/handoff-draft-ai.gateway';
import { HANDOFF_DRAFT_REPOSITORY } from './application/ports/handoff-draft.repository';
import { HANDOFF_PRECHECK_REPOSITORY } from './application/ports/handoff-precheck.repository';
import { DeterministicHandoffDraftAiGateway } from './infrastructure/ai/deterministic-handoff-draft-ai.gateway';
import { PrismaHandoffDraftRepository } from './infrastructure/prisma-handoff-draft.repository';
import { PrismaHandoffPrecheckRepository } from './infrastructure/prisma-handoff-precheck.repository';
import { HandoffDraftsController } from './presentation/handoff-drafts.controller';

@Module({
  imports: [AiJobsModule, TasksModule, TimelineModule],
  controllers: [HandoffDraftsController],
  providers: [
    HandoffDraftsService,
    HandoffDraftJobProcessor,
    PrismaHandoffDraftRepository,
    PrismaHandoffPrecheckRepository,
    {
      provide: HANDOFF_DRAFT_REPOSITORY,
      useExisting: PrismaHandoffDraftRepository,
    },
    {
      provide: HANDOFF_PRECHECK_REPOSITORY,
      useExisting: PrismaHandoffPrecheckRepository,
    },
    {
      provide: HANDOFF_DRAFT_AI_GATEWAY,
      useClass: DeterministicHandoffDraftAiGateway,
    },
  ],
  exports: [HandoffDraftsService, HandoffDraftJobProcessor],
})
export class HandoffDraftsModule {}
