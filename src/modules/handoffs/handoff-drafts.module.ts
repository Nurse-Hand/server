import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { TasksModule } from '../tasks/tasks.module';
import { TimelineModule } from '../timeline/timeline.module';
import { HandoffDraftJobProcessor } from './application/handoff-draft-job.processor';
import { HandoffDraftsService } from './application/handoff-drafts.service';
import { HANDOFF_DRAFT_AI_GATEWAY } from './application/ports/handoff-draft-ai.gateway';
import { HANDOFF_DRAFT_REPOSITORY } from './application/ports/handoff-draft.repository';
import { HANDOFF_PRECHECK_REPOSITORY } from './application/ports/handoff-precheck.repository';
import { DeterministicHandoffDraftAiGateway } from './infrastructure/ai/deterministic-handoff-draft-ai.gateway';
import { HttpHandoffAiClient } from './infrastructure/ai/http-handoff-ai.client';
import { HttpHandoffDraftAiGateway } from './infrastructure/ai/http-handoff-draft-ai.gateway';
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
    DeterministicHandoffDraftAiGateway,
    HttpHandoffAiClient,
    HttpHandoffDraftAiGateway,
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
      inject: [
        ConfigService,
        HttpHandoffDraftAiGateway,
        DeterministicHandoffDraftAiGateway,
      ],
      useFactory: (
        configService: ConfigService,
        httpGateway: HttpHandoffDraftAiGateway,
        fallbackGateway: DeterministicHandoffDraftAiGateway,
      ) =>
        shouldUseHandoffAiFallback(configService)
          ? fallbackGateway
          : httpGateway,
    },
  ],
  exports: [HandoffDraftsService, HandoffDraftJobProcessor],
})
export class HandoffDraftsModule {}

function shouldUseHandoffAiFallback(configService: ConfigService): boolean {
  return (
    configService.get<string>('NODE_ENV') === 'test' &&
    !hasHandoffAiConfiguration(configService)
  );
}

function hasHandoffAiConfiguration(configService: ConfigService): boolean {
  return Boolean(
    configService.get<string>('AI_BASE_URL')?.trim() &&
    configService.get<string>('AI_INTERNAL_API_TOKEN')?.trim(),
  );
}
