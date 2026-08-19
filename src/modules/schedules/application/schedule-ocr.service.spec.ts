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
          attempt: 1,
          claimedAt: new Date('2026-08-19T00:00:00.000Z'),
          failureCode: 'SCHEDULE_OCR_ENGINE_UNAVAILABLE',
          retryable: false,
          resultReference: null,
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
    claimOptions: {
      status?: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
      leaseVersion?: number;
      terminalRace?: boolean;
    } = {},
  ) {
    let updateCall = 0;
    const aiJobUpdate = jest.fn().mockImplementation(() => {
      updateCall += 1;
      return Promise.resolve({
        count: claimOptions.terminalRace && updateCall === 2 ? 0 : 1,
      });
    });
    const scheduleUpdate = jest.fn().mockResolvedValue({});
    const scheduleUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    let findCall = 0;
    const transactionClient = {
      aiJob: {
        findUnique: jest.fn().mockImplementation(() => {
          findCall += 1;
          return Promise.resolve({
            status:
              claimOptions.terminalRace && findCall > 1
                ? 'SUCCEEDED'
                : (claimOptions.status ?? 'PROCESSING'),
            leaseVersion: claimOptions.leaseVersion ?? 1,
          });
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          idempotencyRecordId: '00000000-0000-4000-8000-000000000106',
        }),
        updateMany: aiJobUpdate,
      },
      idempotencyRecord: { update: jest.fn().mockResolvedValue({}) },
      scheduleOcrJob: {
        update: scheduleUpdate,
        updateMany: scheduleUpdateMany,
      },
    };
    const prisma = {
      scheduleOcrJob: {
        update: scheduleUpdate,
        updateMany: scheduleUpdateMany,
        findMany: jest.fn().mockResolvedValue([
          {
            aiJobId: '00000000-0000-4000-8000-000000000105',
            storageUri: 'schedule-ocr://fixture.png',
            cleanupPendingStatus: 'SUCCEEDED',
            cleanupPendingFailureCode: null,
            cleanupPendingRetryable: null,
            cleanupPendingResultExpiresAt: new Date('2026-08-20T00:00:00.000Z'),
            cleanupLeaseVersion: 1,
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
    return {
      service,
      storage,
      aiJobUpdate,
      scheduleUpdate,
      scheduleUpdateMany,
    };
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
    expect(harness.aiJobUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(harness.scheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cleanupPendingStatus: 'SUCCEEDED',
          cleanupFailedAt: new Date('2026-08-19T00:00:00.000Z'),
        }),
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

  it('terminal replay의 stale URI는 AiJob을 다시 갱신하지 않고 비운다', async () => {
    const harness = createRetryHarness(
      undefined,
      {},
      { status: 'SUCCEEDED', leaseVersion: 2 },
    );
    await expect(harness.service.retryPendingCleanup()).resolves.toBe(1);
    expect(harness.aiJobUpdate).not.toHaveBeenCalled();
    expect(harness.scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storageUri: null }),
      }),
    );
  });

  it('stale lease는 파일 삭제 전에 fencing하고 다음 실행에 남긴다', async () => {
    const harness = createRetryHarness(
      undefined,
      { cleanupLeaseVersion: 1 },
      { status: 'PROCESSING', leaseVersion: 2 },
    );
    await expect(harness.service.retryPendingCleanup()).resolves.toBe(0);
    expect(harness.storage.delete).not.toHaveBeenCalled();
    expect(harness.scheduleUpdateMany).not.toHaveBeenCalled();
  });

  it('delete 뒤 terminal CAS가 0이면 terminal replay를 구분해 URI만 비운다', async () => {
    const harness = createRetryHarness(undefined, {}, { terminalRace: true });
    await expect(harness.service.retryPendingCleanup()).resolves.toBe(1);
    expect(harness.storage.delete).toHaveBeenCalledTimes(1);
    expect(harness.scheduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storageUri: null }),
      }),
    );
  });
});
