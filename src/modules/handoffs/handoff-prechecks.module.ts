import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { TasksModule } from '../tasks/tasks.module';
import { TimelineModule } from '../timeline/timeline.module';
import { HandoffPrecheckJobProcessor } from './application/handoff-precheck-job.processor';
import { HandoffPrechecksService } from './application/handoff-prechecks.service';
import { HANDOFF_PRECHECK_AI_GATEWAY } from './application/ports/handoff-precheck-ai.gateway';
import { HANDOFF_PRECHECK_REPOSITORY } from './application/ports/handoff-precheck.repository';
import { DeterministicHandoffPrecheckAiGateway } from './infrastructure/ai/deterministic-handoff-precheck-ai.gateway';
import { HttpHandoffAiClient } from './infrastructure/ai/http-handoff-ai.client';
import { HttpHandoffPrecheckAiGateway } from './infrastructure/ai/http-handoff-precheck-ai.gateway';
import { PrismaHandoffPrecheckRepository } from './infrastructure/prisma-handoff-precheck.repository';
import { HandoffPrechecksController } from './presentation/handoff-prechecks.controller';

@Module({
  imports: [AiJobsModule, TasksModule, TimelineModule],
  controllers: [HandoffPrechecksController],
  providers: [
    HandoffPrechecksService,
    HandoffPrecheckJobProcessor,
    PrismaHandoffPrecheckRepository,
    DeterministicHandoffPrecheckAiGateway,
    HttpHandoffAiClient,
    HttpHandoffPrecheckAiGateway,
    {
      provide: HANDOFF_PRECHECK_REPOSITORY,
      useExisting: PrismaHandoffPrecheckRepository,
    },
    {
      provide: HANDOFF_PRECHECK_AI_GATEWAY,
      inject: [
        ConfigService,
        HttpHandoffPrecheckAiGateway,
        DeterministicHandoffPrecheckAiGateway,
      ],
      useFactory: (
        configService: ConfigService,
        httpGateway: HttpHandoffPrecheckAiGateway,
        fallbackGateway: DeterministicHandoffPrecheckAiGateway,
      ) =>
        shouldUseHandoffAiFallback(configService)
          ? fallbackGateway
          : httpGateway,
    },
  ],
  exports: [HandoffPrechecksService, HandoffPrecheckJobProcessor],
})
export class HandoffPrechecksModule {}

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
