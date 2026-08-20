import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { TASK_EXTRACTION_AI_GATEWAY } from './application/ports/task-extraction-ai.gateway';
import { TASK_EXTRACTION_EVIDENCE_PORT } from './application/ports/task-extraction-evidence.port';
import { TASK_PRIORITY_AI_GATEWAY } from './application/ports/task-priority-ai.gateway';
import { TASK_QUERY_PORT } from './application/ports/task-query.port';
import { TASK_PRIORITY_SUGGESTION_GATEWAY } from './application/ports/task-priority-suggestion.gateway';
import { TASK_PRIORITY_SUGGESTION_REPOSITORY } from './application/ports/task-priority-suggestion.repository';
import { TASK_REPOSITORY } from './application/ports/task.repository';
import { TaskExtractionWorker } from './application/task-extraction.worker';
import { TaskPrioritySuggestionService } from './application/task-priority-suggestion.service';
import { TaskService } from './application/task.service';
import { HttpTaskExtractionAiAdapter } from './infrastructure/ai/http-task-extraction-ai.adapter';
import { HttpTaskPriorityAiAdapter } from './infrastructure/ai/http-task-priority-ai.adapter';
import { DeterministicTaskExtractionAiAdapter } from './infrastructure/deterministic-task-extraction-ai.adapter';
import { DeterministicTaskExtractionEvidenceAdapter } from './infrastructure/deterministic-task-extraction-evidence.adapter';
import { HttpTaskPrioritySuggestionAdapter } from './infrastructure/ai/http-task-priority-suggestion.adapter';
import { PrismaTaskExtractionEvidenceAdapter } from './infrastructure/prisma-task-extraction-evidence.adapter';
import { PrismaTaskRepository } from './infrastructure/prisma-task.repository';
import { TasksController } from './presentation/tasks.controller';

@Module({
  imports: [AiJobsModule],
  controllers: [TasksController],
  providers: [
    TaskService,
    TaskPrioritySuggestionService,
    TaskExtractionWorker,
    PrismaTaskRepository,
    PrismaTaskExtractionEvidenceAdapter,
    DeterministicTaskExtractionEvidenceAdapter,
    DeterministicTaskExtractionAiAdapter,
    HttpTaskExtractionAiAdapter,
    HttpTaskPriorityAiAdapter,
    HttpTaskPrioritySuggestionAdapter,
    { provide: TASK_REPOSITORY, useExisting: PrismaTaskRepository },
    { provide: TASK_QUERY_PORT, useExisting: PrismaTaskRepository },
    {
      provide: TASK_PRIORITY_SUGGESTION_REPOSITORY,
      useExisting: PrismaTaskRepository,
    },
    {
      provide: TASK_EXTRACTION_EVIDENCE_PORT,
      useExisting: PrismaTaskExtractionEvidenceAdapter,
    },
    {
      provide: TASK_EXTRACTION_AI_GATEWAY,
      inject: [
        ConfigService,
        HttpTaskExtractionAiAdapter,
        DeterministicTaskExtractionAiAdapter,
      ],
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpTaskExtractionAiAdapter,
        fallbackAdapter: DeterministicTaskExtractionAiAdapter,
      ) =>
        hasTaskAiConfiguration(configService) ? httpAdapter : fallbackAdapter,
    },
    {
      provide: TASK_PRIORITY_AI_GATEWAY,
      useExisting: HttpTaskPriorityAiAdapter,
    },
    {
      provide: TASK_PRIORITY_SUGGESTION_GATEWAY,
      useExisting: HttpTaskPrioritySuggestionAdapter,
    },
  ],
  exports: [TASK_QUERY_PORT, TaskExtractionWorker],
})
export class TasksModule {}

function hasTaskAiConfiguration(configService: ConfigService): boolean {
  return Boolean(
    configService.get<string>('AI_BASE_URL')?.trim() &&
    configService.get<string>('AI_INTERNAL_API_TOKEN')?.trim(),
  );
}
