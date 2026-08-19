import { Module } from '@nestjs/common';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { TASK_EXTRACTION_AI_GATEWAY } from './application/ports/task-extraction-ai.gateway';
import { TASK_EXTRACTION_EVIDENCE_PORT } from './application/ports/task-extraction-evidence.port';
import { TASK_PRIORITY_AI_GATEWAY } from './application/ports/task-priority-ai.gateway';
import { TASK_QUERY_PORT } from './application/ports/task-query.port';
import { TASK_REPOSITORY } from './application/ports/task.repository';
import { TaskExtractionWorker } from './application/task-extraction.worker';
import { TaskService } from './application/task.service';
import { DeterministicTaskExtractionAiAdapter } from './infrastructure/deterministic-task-extraction-ai.adapter';
import { DeterministicTaskExtractionEvidenceAdapter } from './infrastructure/deterministic-task-extraction-evidence.adapter';
import { DeterministicTaskPriorityAiAdapter } from './infrastructure/deterministic-task-priority-ai.adapter';
import { PrismaTaskRepository } from './infrastructure/prisma-task.repository';
import { TasksController } from './presentation/tasks.controller';

@Module({
  imports: [AiJobsModule],
  controllers: [TasksController],
  providers: [
    TaskService,
    TaskExtractionWorker,
    PrismaTaskRepository,
    DeterministicTaskExtractionEvidenceAdapter,
    DeterministicTaskExtractionAiAdapter,
    DeterministicTaskPriorityAiAdapter,
    { provide: TASK_REPOSITORY, useExisting: PrismaTaskRepository },
    { provide: TASK_QUERY_PORT, useExisting: PrismaTaskRepository },
    {
      provide: TASK_EXTRACTION_EVIDENCE_PORT,
      useExisting: DeterministicTaskExtractionEvidenceAdapter,
    },
    {
      provide: TASK_EXTRACTION_AI_GATEWAY,
      useExisting: DeterministicTaskExtractionAiAdapter,
    },
    {
      provide: TASK_PRIORITY_AI_GATEWAY,
      useExisting: DeterministicTaskPriorityAiAdapter,
    },
  ],
  exports: [TASK_QUERY_PORT, TaskExtractionWorker],
})
export class TasksModule {}
