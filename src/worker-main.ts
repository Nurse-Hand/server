import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TaskHandoffJobDispatcher } from './modules/job-execution/task-handoff-job.dispatcher';
import { WorkerAppModule } from './worker-app.module';

const DEFAULT_POLL_INTERVAL_MILLISECONDS = 1_000;

async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  const pollIntervalMilliseconds = readPollIntervalMilliseconds();
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['error', 'log', 'warn'],
  });
  const dispatcher = app.get(TaskHandoffJobDispatcher);

  let shuttingDown = false;

  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`received ${signal}; draining worker`);
    await dispatcher.shutdown();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.log(`worker started; pollIntervalMs=${pollIntervalMilliseconds}`);

  while (!shuttingDown) {
    try {
      await dispatcher.runOnce();
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

void bootstrap();
