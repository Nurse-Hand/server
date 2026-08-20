import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { HandoffDraftJobProcessor } from '../handoffs/application/handoff-draft-job.processor';
import { HandoffPrecheckJobProcessor } from '../handoffs/application/handoff-precheck-job.processor';
import { HANDOFF_JOB_OPERATIONS } from '../handoffs/domain/handoff.constants';
import { TaskExtractionWorker } from '../tasks/application/task-extraction.worker';
import { TASK_EXTRACTION_OPERATION } from '../tasks/domain/task.types';

const OPERATIONS = [
  TASK_EXTRACTION_OPERATION,
  HANDOFF_JOB_OPERATIONS.PRECHECK,
  HANDOFF_JOB_OPERATIONS.GENERATE,
] as const;

type JobScope = { datasetId: string; wardId: string };
export type WorkerDrainResult = 'DRAINED' | 'TIMED_OUT';

@Injectable()
export class TaskHandoffJobDispatcher {
  private readonly logger = new Logger(TaskHandoffJobDispatcher.name);
  private activeDispatch: Promise<boolean> | undefined;
  private isShuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskExtraction: TaskExtractionWorker,
    private readonly handoffPrecheck: HandoffPrecheckJobProcessor,
    private readonly handoffDraft: HandoffDraftJobProcessor,
    private readonly clock: Clock,
  ) {}

  async shutdown(timeoutMilliseconds: number): Promise<WorkerDrainResult> {
    if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds < 1) {
      throw new Error('worker drain timeout must be a positive integer');
    }

    this.isShuttingDown = true;
    const activeDispatch = this.activeDispatch;
    if (activeDispatch === undefined) return 'DRAINED';

    return this.waitForActiveDispatch(activeDispatch, timeoutMilliseconds);
  }

  async runOnce(): Promise<boolean> {
    if (this.isShuttingDown || this.activeDispatch !== undefined) {
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
      if (this.isShuttingDown) break;
      await this.processScope(scope);
    }
    return true;
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
    if (this.isShuttingDown) return;
    await this.processOperation(TASK_EXTRACTION_OPERATION, () =>
      this.taskExtraction.processNext(scope),
    );
    if (this.isShuttingDown) return;
    await this.processOperation(HANDOFF_JOB_OPERATIONS.PRECHECK, () =>
      this.handoffPrecheck.processNext(scope),
    );
    if (this.isShuttingDown) return;
    await this.processOperation(HANDOFF_JOB_OPERATIONS.GENERATE, () =>
      this.handoffDraft.processNext(scope),
    );
  }

  private waitForActiveDispatch(
    activeDispatch: Promise<boolean>,
    timeoutMilliseconds: number,
  ): Promise<WorkerDrainResult> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: WorkerDrainResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const timeout = setTimeout(
        () => finish('TIMED_OUT'),
        timeoutMilliseconds,
      );

      void activeDispatch.then(
        () => finish('DRAINED'),
        () => {
          this.logger.error({
            event: 'dispatch_drain_failed',
            errorType: 'UnknownError',
          });
          finish('DRAINED');
        },
      );
    });
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
  event: 'processor_failed',
  _error: unknown,
  operation?: (typeof OPERATIONS)[number],
): Record<string, string> {
  const result: Record<string, string> = { event };
  if (operation !== undefined) result.operation = operation;
  result.errorType = 'UnknownError';
  return result;
}
