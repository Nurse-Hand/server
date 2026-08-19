import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { HandoffDraftJobProcessor } from '../handoffs/application/handoff-draft-job.processor';
import { HandoffPrecheckJobProcessor } from '../handoffs/application/handoff-precheck-job.processor';
import { HANDOFF_JOB_OPERATIONS } from '../handoffs/domain/handoff.constants';
import { TaskExtractionWorker } from '../tasks/application/task-extraction.worker';
import { TASK_EXTRACTION_OPERATION } from '../tasks/domain/task.types';

const DISPATCH_INTERVAL_MILLISECONDS = 1_000;
const OPERATIONS = [
  TASK_EXTRACTION_OPERATION,
  HANDOFF_JOB_OPERATIONS.PRECHECK,
  HANDOFF_JOB_OPERATIONS.GENERATE,
] as const;

type JobScope = { datasetId: string; wardId: string };

@Injectable()
export class TaskHandoffJobDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TaskHandoffJobDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private isDispatching = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskExtraction: TaskExtractionWorker,
    private readonly handoffPrecheck: HandoffPrecheckJobProcessor,
    private readonly handoffDraft: HandoffDraftJobProcessor,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(
      () => void this.tick(),
      DISPATCH_INTERVAL_MILLISECONDS,
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce(): Promise<boolean> {
    if (this.isDispatching) {
      return false;
    }

    this.isDispatching = true;
    try {
      const scopes = await this.findRunnableScopes();
      for (const scope of scopes) {
        await this.processScope(scope);
      }
      return true;
    } finally {
      this.isDispatching = false;
    }
  }

  private async tick(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error: unknown) {
      this.logger.error(
        'Task/Handoff job dispatch cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private findRunnableScopes(): Promise<JobScope[]> {
    return this.prisma.aiJob.findMany({
      where: {
        operation: { in: [...OPERATIONS] },
        OR: [
          { status: 'QUEUED' },
          {
            status: 'PROCESSING',
            leaseExpiresAt: { lte: this.clock.now() },
          },
        ],
      },
      select: { datasetId: true, wardId: true },
      distinct: ['datasetId', 'wardId'],
      orderBy: [{ datasetId: 'asc' }, { wardId: 'asc' }],
    });
  }

  private async processScope(scope: JobScope): Promise<void> {
    await this.processOperation(TASK_EXTRACTION_OPERATION, () =>
      this.taskExtraction.processNext(scope),
    );
    await this.processOperation(HANDOFF_JOB_OPERATIONS.PRECHECK, () =>
      this.handoffPrecheck.processNext(scope),
    );
    await this.processOperation(HANDOFF_JOB_OPERATIONS.GENERATE, () =>
      this.handoffDraft.processNext(scope),
    );
  }

  private async processOperation(
    operation: (typeof OPERATIONS)[number],
    process: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await process();
    } catch (error: unknown) {
      this.logger.error(
        `Job processor failed: ${operation}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
