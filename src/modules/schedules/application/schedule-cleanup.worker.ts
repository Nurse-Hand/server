import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ScheduleOcrService } from './schedule-ocr.service';

const SCHEDULE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ScheduleCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly scheduleOcrService: ScheduleOcrService) {}

  onModuleInit(): void {
    void this.runOnce();
    this.interval = setInterval(() => {
      void this.runOnce();
    }, SCHEDULE_CLEANUP_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scheduleOcrService.cleanupOrphans();
    } catch {
      // 다음 bounded interval에서 재시도한다. 내부 URI나 오류는 노출하지 않는다.
    } finally {
      this.running = false;
    }
  }
}
