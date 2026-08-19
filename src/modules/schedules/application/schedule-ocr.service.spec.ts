import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import type { Clock } from '../../../common/time/clock';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { ScheduleOcrGateway } from './ports/schedule-ocr.gateway';
import type { ScheduleOcrStorage } from './ports/schedule-ocr-storage.port';
import { ScheduleOcrService } from './schedule-ocr.service';
import { createSyntheticScheduleFixture } from '../infrastructure/synthetic-schedule-fixture';

const context = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000102',
  wardId: '00000000-0000-4000-8000-000000000103',
};
const requestId = '00000000-0000-4000-8000-000000000104';

function createHarness(
  options: {
    demoMode?: boolean;
    existingJobId?: string;
    existingRequestHash?: string;
    transactionError?: Error;
  } = {},
) {
  const idempotencyCreate = jest.fn().mockResolvedValue({});
  const aiJobCreate = jest.fn().mockResolvedValue({});
  const scheduleCreate = jest.fn().mockResolvedValue({});
  const transactionClient = {
    idempotencyRecord: {
      findUnique: jest.fn().mockResolvedValue(
        options.existingJobId
          ? {
              wardId: context.wardId,
              requestHash: options.existingRequestHash,
              aiJob: { id: options.existingJobId },
            }
          : null,
      ),
      create: idempotencyCreate,
    },
    aiJob: { create: aiJobCreate },
    scheduleOcrJob: { create: scheduleCreate },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation(
        options.transactionError
          ? () => Promise.reject(options.transactionError)
          : (callback: (client: typeof transactionClient) => unknown) =>
              callback(transactionClient),
      ),
    idempotencyRecord: transactionClient.idempotencyRecord,
  } as unknown as PrismaService;
  const gateway = {
    recognize: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<ScheduleOcrGateway>;
  const storage = {
    resolveStorageUri: jest.fn().mockReturnValue('schedule-ocr://fixture.png'),
    store: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<ScheduleOcrStorage>;
  const service = new ScheduleOcrService(
    prisma,
    { now: () => new Date('2026-08-19T00:00:00.000Z') } as Clock,
    new ConfigService({ DEMO_MODE: options.demoMode ?? true }),
    gateway,
    storage,
  );
  return {
    service,
    gateway,
    storage,
    idempotencyCreate,
    aiJobCreate,
    scheduleCreate,
  };
}

function command(image: Buffer) {
  return {
    context,
    file: {
      buffer: image,
      mimetype: 'image/png',
      originalname: 'synthetic.png',
    },
    yearMonth: '2026-08',
    templateId: 'FIXED_V1',
    rowIndex: 2,
    idempotencyKey: 'schedule-ocr-1',
    requestId,
  };
}

describe('ScheduleOcrService reservation', () => {
  it('allowlist 밖 이미지는 파일 저장 없이 FAILED Job과 detail을 한 transaction에 남긴다', async () => {
    const harness = createHarness();
    await expect(
      harness.service.create(command(createSyntheticScheduleFixture(641, 480))),
    ).resolves.toMatchObject({ status: 'QUEUED', isReplay: false });
    expect(harness.storage.store).not.toHaveBeenCalled();
    expect(harness.gateway.recognize).not.toHaveBeenCalled();
    expect(harness.aiJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureCode: 'SCHEDULE_OCR_ENGINE_UNAVAILABLE',
          retryable: false,
        }),
      }),
    );
    expect(harness.scheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storageUri: null }),
      }),
    );
  });

  it('reservation DB가 실패하면 추적되지 않은 파일을 쓰지 않는다', async () => {
    const harness = createHarness({ transactionError: new Error('db-failed') });
    await expect(
      harness.service.create(command(createSyntheticScheduleFixture())),
    ).rejects.toThrow('db-failed');
    expect(harness.storage.store).not.toHaveBeenCalled();
    expect(harness.storage.delete).not.toHaveBeenCalled();
  });

  it('non-DEMO에서는 exact fixture도 파일 저장 없이 FAILED Job으로 접수한다', async () => {
    const harness = createHarness({ demoMode: false });
    await harness.service.create(command(createSyntheticScheduleFixture()));
    expect(harness.storage.store).not.toHaveBeenCalled();
    expect(harness.aiJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('terminal replay도 POST 계약상 QUEUED를 재응답하고 파일을 새로 쓰지 않는다', async () => {
    const image = createSyntheticScheduleFixture();
    const requestHash = createCanonicalRequestHash({
      path: {},
      query: {},
      body: {
        fileHash: createHash('sha256').update(image).digest('hex'),
        rowIndex: 2,
        templateId: 'FIXED_V1',
        yearMonth: '2026-08',
      },
    });
    const harness = createHarness({
      existingJobId: '00000000-0000-4000-8000-000000000105',
      existingRequestHash: requestHash,
    });
    await expect(harness.service.create(command(image))).resolves.toEqual({
      jobId: '00000000-0000-4000-8000-000000000105',
      status: 'QUEUED',
      isReplay: true,
    });
    expect(harness.storage.store).not.toHaveBeenCalled();
    expect(harness.storage.delete).not.toHaveBeenCalled();
    expect(harness.gateway.recognize).not.toHaveBeenCalled();
    expect(harness.aiJobCreate).not.toHaveBeenCalled();
  });
});

describe('ScheduleOcrService cleanup retry', () => {
  function createRetryHarness(
    deleteError?: Error,
    rowOverrides: Record<string, unknown> = {},
  ) {
    const aiJobUpdate = jest.fn().mockResolvedValue({
      idempotencyRecordId: '00000000-0000-4000-8000-000000000106',
    });
    const scheduleUpdate = jest.fn().mockResolvedValue({});
    const transactionClient = {
      aiJob: { update: aiJobUpdate },
      idempotencyRecord: { update: jest.fn().mockResolvedValue({}) },
      scheduleOcrJob: { update: scheduleUpdate },
    };
    const prisma = {
      scheduleOcrJob: {
        findMany: jest.fn().mockResolvedValue([
          {
            aiJobId: '00000000-0000-4000-8000-000000000105',
            storageUri: 'schedule-ocr://fixture.png',
            cleanupPendingStatus: 'SUCCEEDED',
            cleanupPendingFailureCode: null,
            cleanupPendingRetryable: null,
            cleanupPendingResultExpiresAt: new Date('2026-08-20T00:00:00.000Z'),
            aiJob: {
              failureCode: 'SCHEDULE_OCR_CLEANUP_FAILED',
              retryable: true,
            },
            _count: { cells: 31 },
            ...rowOverrides,
          },
        ]),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          (callback: (client: typeof transactionClient) => unknown) =>
            callback(transactionClient),
        ),
    } as unknown as PrismaService;
    const storage = {
      resolveStorageUri: jest.fn(),
      store: jest.fn(),
      delete: deleteError
        ? jest.fn().mockRejectedValue(deleteError)
        : jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ScheduleOcrStorage>;
    const service = new ScheduleOcrService(
      prisma,
      { now: () => new Date('2026-08-19T00:00:00.000Z') } as Clock,
      new ConfigService({ DEMO_MODE: true }),
      { recognize: jest.fn() } as unknown as ScheduleOcrGateway,
      storage,
    );
    return { service, storage, aiJobUpdate, scheduleUpdate };
  }

  it('삭제 재시도 성공 시 원래 SUCCEEDED와 TTL을 복원하고 URI를 비운다', async () => {
    const harness = createRetryHarness();
    await expect(harness.service.retryPendingCleanup()).resolves.toBe(1);
    expect(harness.aiJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          failureCode: null,
          resultReference: '00000000-0000-4000-8000-000000000105',
        }),
      }),
    );
    expect(harness.scheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageUri: null,
          resultExpiresAt: new Date('2026-08-20T00:00:00.000Z'),
          cleanupPendingStatus: null,
        }),
      }),
    );
  });

  it('삭제 재시도가 실패하면 URI를 지우지 않고 retryable cleanup 상태를 유지한다', async () => {
    const harness = createRetryHarness(new Error('EACCES'));
    await expect(harness.service.retryPendingCleanup()).resolves.toBe(0);
    expect(harness.aiJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureCode: 'SCHEDULE_OCR_CLEANUP_FAILED',
          retryable: true,
        }),
      }),
    );
    expect(harness.scheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ storageUri: null }),
      }),
    );
  });

  it('결과 저장 후 crash는 cells를 근거로 SUCCEEDED를 복구한다', async () => {
    const harness = createRetryHarness(undefined, {
      cleanupPendingStatus: null,
      cleanupPendingFailureCode: null,
      cleanupPendingRetryable: null,
      cleanupPendingResultExpiresAt: null,
      _count: { cells: 31 },
    });
    await expect(harness.service.retryPendingCleanup()).resolves.toBe(1);
    expect(harness.aiJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
  });

  it('파일 write 전 crash는 ENOENT cleanup 뒤 안전한 FAILED로 회수한다', async () => {
    const harness = createRetryHarness(undefined, {
      cleanupPendingStatus: null,
      cleanupPendingFailureCode: null,
      cleanupPendingRetryable: null,
      cleanupPendingResultExpiresAt: null,
      aiJob: { failureCode: null, retryable: null },
      _count: { cells: 0 },
    });
    await expect(harness.service.retryPendingCleanup()).resolves.toBe(1);
    expect(harness.aiJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureCode: 'SCHEDULE_OCR_INTERRUPTED',
          retryable: true,
        }),
      }),
    );
  });
});
