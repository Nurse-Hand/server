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

  it('실행 가능한 scope의 세 processor를 빠짐없이 호출한다', async () => {
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

  it('빈 poll도 DB 조회 성공 직후 progress를 한 번 기록한다', async () => {
    const onProgress = jest.fn().mockResolvedValue(undefined);
    findMany.mockResolvedValueOnce([]);

    await expect(dispatcher.runOnce(onProgress)).resolves.toBe(true);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('실행 scope가 있으면 DB poll과 각 scope 완료 후 progress를 기록한다', async () => {
    const onProgress = jest.fn().mockResolvedValue(undefined);

    await expect(dispatcher.runOnce(onProgress)).resolves.toBe(true);

    expect(onProgress).toHaveBeenCalledTimes(3);
  });

  it('한 processor 예외가 다음 operation을 막거나 민감정보를 기록하지 않는다', async () => {
    const marker = 'SYNTHETIC_PATIENT_SUMMARY_1234';
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const error = new Error(`${marker}: worker crash`);
    error.name = marker;
    error.stack = `${error.name}: ${error.message}\n at ${marker}`;
    taskExtraction.processNext.mockRejectedValueOnce(error);

    await dispatcher.runOnce();

    expect(handoffPrecheck.processNext).toHaveBeenCalledWith(SCOPE_A);
    expect(handoffDraft.processNext).toHaveBeenCalledWith(SCOPE_A);
    expect(logger).toHaveBeenCalledWith({
      event: 'processor_failed',
      operation: 'tasks.extract',
      errorType: 'UnknownError',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(marker);
    expect(JSON.stringify(logger.mock.calls)).not.toContain('worker crash');
  });

  it('이전 cycle이 끝나기 전에는 겹쳐 실행하지 않는다', async () => {
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

  it('shutdown은 진행 중인 cycle을 기다리고 이후 실행을 차단한다', async () => {
    let release: (() => void) | undefined;
    findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );

    const dispatch = dispatcher.runOnce();
    let shutdownCompleted = false;
    const shutdown = dispatcher.shutdown(1_000).then((result) => {
      shutdownCompleted = true;
      return result;
    });
    await Promise.resolve();
    expect(shutdownCompleted).toBe(false);

    release?.();
    await dispatch;
    await expect(shutdown).resolves.toBe('DRAINED');
    expect(shutdownCompleted).toBe(true);
    await expect(dispatcher.runOnce()).resolves.toBe(false);
  });

  it('shutdown 이후에는 진행 중 operation만 마치고 새 operation과 scope를 시작하지 않는다', async () => {
    let release: (() => void) | undefined;
    taskExtraction.processNext.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 'IDLE' });
        }),
    );

    const dispatch = dispatcher.runOnce();
    await Promise.resolve();
    await Promise.resolve();
    expect(taskExtraction.processNext).toHaveBeenCalledWith(SCOPE_A);

    const shutdown = dispatcher.shutdown(1_000);
    release?.();

    await expect(dispatch).resolves.toBe(true);
    await expect(shutdown).resolves.toBe('DRAINED');
    expect(taskExtraction.processNext).toHaveBeenCalledTimes(1);
    expect(handoffPrecheck.processNext).not.toHaveBeenCalled();
    expect(handoffDraft.processNext).not.toHaveBeenCalled();
  });

  it('진행 중 operation이 끝나지 않아도 제한 시간 뒤 drain을 종료한다', async () => {
    taskExtraction.processNext.mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    void dispatcher.runOnce();
    await Promise.resolve();
    await Promise.resolve();
    expect(taskExtraction.processNext).toHaveBeenCalledWith(SCOPE_A);

    await expect(dispatcher.shutdown(5)).resolves.toBe('TIMED_OUT');
    await expect(dispatcher.runOnce()).resolves.toBe(false);
  });

  it('cycle 실패 drain도 민감정보 없이 shutdown을 완료한다', async () => {
    const marker = 'SYNTHETIC_PATIENT_SUMMARY_5678';
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    findMany.mockRejectedValueOnce({
      code: marker,
      name: marker,
      message: marker,
    });

    const dispatch = dispatcher.runOnce();
    const shutdown = dispatcher.shutdown(1_000);

    await expect(dispatch).rejects.toBeDefined();
    await expect(shutdown).resolves.toBe('DRAINED');
    expect(logger).toHaveBeenCalledWith({
      event: 'dispatch_drain_failed',
      errorType: 'UnknownError',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain(marker);
    await expect(dispatcher.runOnce()).resolves.toBe(false);
  });
});
