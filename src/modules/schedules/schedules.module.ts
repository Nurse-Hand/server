import { Module } from '@nestjs/common';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { ScheduleOcrService } from './application/schedule-ocr.service';
import { SCHEDULE_OCR_GATEWAY } from './application/ports/schedule-ocr.gateway';
import { SCHEDULE_OCR_STORAGE } from './application/ports/schedule-ocr-storage.port';
import { DeterministicScheduleOcrGateway } from './infrastructure/deterministic-schedule-ocr.gateway';
import { LocalScheduleOcrStorageAdapter } from './infrastructure/local-schedule-ocr-storage.adapter';
import { ScheduleOcrController } from './presentation/schedule-ocr.controller';

@Module({
  imports: [AiJobsModule],
  controllers: [ScheduleOcrController],
  providers: [
    ScheduleOcrService,
    DeterministicScheduleOcrGateway,
    LocalScheduleOcrStorageAdapter,
    {
      provide: SCHEDULE_OCR_GATEWAY,
      useExisting: DeterministicScheduleOcrGateway,
    },
    {
      provide: SCHEDULE_OCR_STORAGE,
      useExisting: LocalScheduleOcrStorageAdapter,
    },
  ],
})
export class SchedulesModule {}
