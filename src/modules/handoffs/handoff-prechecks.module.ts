import { Module } from '@nestjs/common';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { TasksModule } from '../tasks/tasks.module';
import { TimelineModule } from '../timeline/timeline.module';
import { HandoffPrecheckJobProcessor } from './application/handoff-precheck-job.processor';
import { HandoffPrechecksService } from './application/handoff-prechecks.service';
import { HANDOFF_PRECHECK_AI_GATEWAY } from './application/ports/handoff-precheck-ai.gateway';
import { HANDOFF_PRECHECK_REPOSITORY } from './application/ports/handoff-precheck.repository';
import { DeterministicHandoffPrecheckAiGateway } from './infrastructure/ai/deterministic-handoff-precheck-ai.gateway';
import { PrismaHandoffPrecheckRepository } from './infrastructure/prisma-handoff-precheck.repository';
import { HandoffPrechecksController } from './presentation/handoff-prechecks.controller';

@Module({
  imports: [AiJobsModule, TasksModule, TimelineModule],
  controllers: [HandoffPrechecksController],
  providers: [
    HandoffPrechecksService,
    HandoffPrecheckJobProcessor,
    PrismaHandoffPrecheckRepository,
    {
      provide: HANDOFF_PRECHECK_REPOSITORY,
      useExisting: PrismaHandoffPrecheckRepository,
    },
    {
      provide: HANDOFF_PRECHECK_AI_GATEWAY,
      useClass: DeterministicHandoffPrecheckAiGateway,
    },
  ],
  exports: [HandoffPrechecksService, HandoffPrecheckJobProcessor],
})
export class HandoffPrechecksModule {}
