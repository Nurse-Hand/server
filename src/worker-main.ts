import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TaskHandoffJobDispatcher } from './modules/job-execution/task-handoff-job.dispatcher';
import { WorkerAppModule } from './worker-app.module';
import { clearWorkerHeartbeat, writeWorkerHeartbeat } from './worker-heartbeat';

const DEFAULT_POLL_INTERVAL_MILLISECONDS = 1_000;
const WORKER_DRAIN_TIMEOUT_MILLISECONDS = 20_000;
const APPLICATION_CLOSE_TIMEOUT_MILLISECONDS = 5_000;

async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  const pollIntervalMilliseconds = readPollIntervalMilliseconds();
  await clearWorkerHeartbeat();
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['error', 'log', 'warn'],
  });
  const dispatcher = app.get(TaskHandoffJobDispatcher);

  let shuttingDown = false;

  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`received ${signal}; draining worker`);
    try {
      const drainResult = await dispatcher.shutdown(
        WORKER_DRAIN_TIMEOUT_MILLISECONDS,
      );
      if (drainResult === 'TIMED_OUT') {
        logger.warn({ event: 'worker_drain_timed_out' });
      }
      const closed = await waitForCompletion(
        app.close(),
        APPLICATION_CLOSE_TIMEOUT_MILLISECONDS,
      );
      if (!closed) {
        logger.warn({ event: 'worker_close_timed_out' });
      }
      process.exit(0);
    } catch {
      logger.error({
        event: 'worker_shutdown_failed',
        errorType: 'UnknownError',
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.log(`worker started; pollIntervalMs=${pollIntervalMilliseconds}`);

  while (!shuttingDown) {
    try {
      const cycleCompleted = await dispatcher.runOnce();
      if (cycleCompleted) {
        await writeWorkerHeartbeat();
      }
    } catch {
      logger.error({
        event: 'worker_cycle_failed',
        errorType: 'UnknownError',
      });
    }

    if (!shuttingDown) {
      await sleep(pollIntervalMilliseconds);
    }
  }
}

function readPollIntervalMilliseconds(): number {
  const raw = process.env.WORKER_POLL_INTERVAL_MS;
  if (!raw) return DEFAULT_POLL_INTERVAL_MILLISECONDS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 60_000) {
    throw new Error(
      'WORKER_POLL_INTERVAL_MS must be an integer between 100 and 60000',
    );
  }
  return parsed;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCompletion(
  operation: Promise<unknown>,
  timeoutMilliseconds: number,
): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation.then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMilliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

void bootstrap().catch(() => {
  new Logger('WorkerBootstrap').error({
    event: 'worker_bootstrap_failed',
    errorType: 'UnknownError',
  });
  process.exit(1);
});
