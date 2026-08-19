import { Module } from '@nestjs/common';
import { AiJobService } from './application/ai-job.service';
import { IdempotentAiJobService } from './application/idempotent-ai-job.service';
import { AI_JOB_REPOSITORY } from './application/ports/ai-job.repository';
import { PrismaAiJobRepository } from './infrastructure/prisma-ai-job.repository';

@Module({
  providers: [
    AiJobService,
    IdempotentAiJobService,
    PrismaAiJobRepository,
    { provide: AI_JOB_REPOSITORY, useExisting: PrismaAiJobRepository },
  ],
  exports: [AiJobService, IdempotentAiJobService],
})
export class AiJobsModule {}
