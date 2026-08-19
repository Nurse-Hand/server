import type { ScheduleOcrService } from './schedule-ocr.service';
import { ScheduleCleanupWorker } from './schedule-cleanup.worker';

describe('ScheduleCleanupWorker', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('실행이 겹치면 두 번째 cleanup을 시작하지 않는다', async () => {
    let release!: () => void;
    const cleanup = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(1);
        }),
    );
    const worker = new ScheduleCleanupWorker({
      cleanupOrphans: cleanup,
    } as unknown as ScheduleOcrService);

    const first = worker.runOnce();
    await worker.runOnce();
    expect(cleanup).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('module destroy 뒤 interval cleanup을 더 실행하지 않는다', async () => {
    jest.useFakeTimers();
    const cleanup = jest.fn().mockResolvedValue(0);
    const worker = new ScheduleCleanupWorker({
      cleanupOrphans: cleanup,
    } as unknown as ScheduleOcrService);

    worker.onModuleInit();
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
    worker.onModuleDestroy();
    jest.advanceTimersByTime(10 * 60 * 1000);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cleanup 조회 오류를 process 밖으로 전파하지 않고 다음 실행을 허용한다', async () => {
    const cleanup = jest
      .fn()
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValueOnce(0);
    const worker = new ScheduleCleanupWorker({
      cleanupOrphans: cleanup,
    } as unknown as ScheduleOcrService);

    await expect(worker.runOnce()).resolves.toBeUndefined();
    await expect(worker.runOnce()).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
