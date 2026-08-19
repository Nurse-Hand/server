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
  private activeDispatch: Promise<boolean> | undefined;

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

  async onApplicationShutdown(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.activeDispatch;
  }

  async runOnce(): Promise<boolean> {
    if (this.activeDispatch !== undefined) {
      return false;
    }

    const dispatch = this.dispatch();
    this.activeDispatch = dispatch;
    try {
      return await dispatch;
    } finally {
      if (this.activeDispatch === dispatch) {
        this.activeDispatch = undefined;
      }
    }
  }

  private async dispatch(): Promise<boolean> {
    const scopes = await this.findRunnableScopes();
    for (const scope of scopes) {
      await this.processScope(scope);
    }
    return true;
  }

  private async tick(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error: unknown) {
      this.logger.error(safeJobError('dispatch_cycle_failed', error));
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
      this.logger.error(safeJobError('processor_failed', error, operation));
    }
  }
}

function safeJobError(
  event: 'dispatch_cycle_failed' | 'processor_failed',
  error: unknown,
  operation?: (typeof OPERATIONS)[number],
): Record<string, string> {
  const result: Record<string, string> = { event };
  if (operation !== undefined) result.operation = operation;

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
  ) {
    result.errorCode = error.code;
  } else if (
    error instanceof Error &&
    /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
  ) {
    result.errorType = error.name;
  } else {
    result.errorType = 'UnknownError';
  }
  return result;
}
