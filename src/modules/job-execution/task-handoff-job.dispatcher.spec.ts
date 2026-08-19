import { Logger } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { HandoffDraftJobProcessor } from '../handoffs/application/handoff-draft-job.processor';
import type { HandoffPrecheckJobProcessor } from '../handoffs/application/handoff-precheck-job.processor';
import type { TaskExtractionWorker } from '../tasks/application/task-extraction.worker';
import { TaskHandoffJobDispatcher } from './task-handoff-job.dispatcher';

const NOW = new Date('2026-08-19T00:00:00.000Z');
const SCOPE_A = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  wardId: '00000000-0000-4000-8000-000000000201',
};
const SCOPE_B = {
  datasetId: '00000000-0000-4000-8000-000000000102',
  wardId: '00000000-0000-4000-8000-000000000202',
};

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

describe('TaskHandoffJobDispatcher', () => {
  const findMany = jest.fn();
  const taskExtraction = { processNext: jest.fn() };
  const handoffPrecheck = { processNext: jest.fn() };
  const handoffDraft = { processNext: jest.fn() };
  let dispatcher: TaskHandoffJobDispatcher;

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([SCOPE_A, SCOPE_B]);
    taskExtraction.processNext
      .mockReset()
      .mockResolvedValue({ status: 'IDLE' });
    handoffPrecheck.processNext.mockReset().mockResolvedValue(null);
    handoffDraft.processNext.mockReset().mockResolvedValue(null);
    dispatcher = new TaskHandoffJobDispatcher(
      { aiJob: { findMany } } as unknown as PrismaService,
      taskExtraction as unknown as TaskExtractionWorker,
      handoffPrecheck as unknown as HandoffPrecheckJobProcessor,
      handoffDraft as unknown as HandoffDraftJobProcessor,
      new FixedClock(),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('실행 가능한 scope를 찾고 Task·precheck·draft processor를 순서대로 호출한다', async () => {
    await expect(dispatcher.runOnce()).resolves.toBe(true);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        operation: {
          in: ['tasks.extract', 'handoffs.precheck', 'handoffs.generate'],
        },
        OR: [
          { status: 'QUEUED' },
          { status: 'PROCESSING', leaseExpiresAt: { lte: NOW } },
        ],
      },
      select: { datasetId: true, wardId: true },
      distinct: ['datasetId', 'wardId'],
      orderBy: [{ datasetId: 'asc' }, { wardId: 'asc' }],
    });
    expect(taskExtraction.processNext.mock.calls).toEqual([
      [SCOPE_A],
      [SCOPE_B],
    ]);
    expect(handoffPrecheck.processNext.mock.calls).toEqual([
      [SCOPE_A],
      [SCOPE_B],
    ]);
    expect(handoffDraft.processNext.mock.calls).toEqual([[SCOPE_A], [SCOPE_B]]);
  });

  it('한 processor 예외가 다른 operation publish를 막지 않는다', async () => {
    const sensitiveMarker = 'SENSITIVE_PATIENT_SUMMARY_1234';
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const error = new Error(`${sensitiveMarker}: worker crash`);
    error.name = sensitiveMarker;
    error.stack = `${error.name}: ${error.message}\n at ${sensitiveMarker}`;
    taskExtraction.processNext.mockRejectedValueOnce(error);

    await dispatcher.runOnce();

    expect(handoffPrecheck.processNext).toHaveBeenCalledWith(SCOPE_A);
    expect(handoffDraft.processNext).toHaveBeenCalledWith(SCOPE_A);
    expect(logger).toHaveBeenCalledWith({
      event: 'processor_failed',
      operation: 'tasks.extract',
      errorType: 'UnknownError',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(sensitiveMarker);
    expect(JSON.stringify(logger.mock.calls)).not.toContain('worker crash');
  });

  it('이전 dispatch cycle이 끝나기 전에는 겹쳐 실행하지 않는다', async () => {
    let release: (() => void) | undefined;
    findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([SCOPE_A]);
        }),
    );

    const first = dispatcher.runOnce();
    await expect(dispatcher.runOnce()).resolves.toBe(false);
    release?.();
    await expect(first).resolves.toBe(true);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('application lifecycle에 polling timer를 등록하고 shutdown에서 정리한다', async () => {
    jest.useFakeTimers();

    dispatcher.onApplicationBootstrap();
    expect(jest.getTimerCount()).toBe(1);

    await dispatcher.onApplicationShutdown();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('shutdown은 진행 중인 dispatch가 끝날 때까지 기다린다', async () => {
    let release: (() => void) | undefined;
    findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );

    const dispatch = dispatcher.runOnce();
    let shutdownCompleted = false;
    const shutdown = dispatcher.onApplicationShutdown().then(() => {
      shutdownCompleted = true;
    });
    await Promise.resolve();
    expect(shutdownCompleted).toBe(false);

    release?.();
    await dispatch;
    await shutdown;
    expect(shutdownCompleted).toBe(true);
    await expect(dispatcher.runOnce()).resolves.toBe(false);
  });

  it('임의 code와 실패 message를 노출하지 않고 shutdown drain을 resolve한다', async () => {
    const sensitiveMarker = 'SENSITIVE_PATIENT_SUMMARY_5678';
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    findMany.mockRejectedValueOnce({
      code: sensitiveMarker,
      name: sensitiveMarker,
      message: sensitiveMarker,
    });

    const dispatch = dispatcher.runOnce();
    const shutdown = dispatcher.onApplicationShutdown();

    await expect(dispatch).rejects.toBeDefined();
    await expect(shutdown).resolves.toBeUndefined();
    expect(logger).toHaveBeenCalledWith({
      event: 'dispatch_drain_failed',
      errorType: 'UnknownError',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(sensitiveMarker);
    await expect(dispatcher.runOnce()).resolves.toBe(false);
  });
});
