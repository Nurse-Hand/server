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
    store: jest.fn().mockResolvedValue('schedule-ocr://fixture.png'),
    delete: jest.fn().mockResolvedValue(undefined),
    sweepOrphans: jest.fn().mockResolvedValue(0),
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

  it('허용 fixture 저장 뒤 reservation DB가 실패하면 파일을 보상 삭제한다', async () => {
    const harness = createHarness({ transactionError: new Error('db-failed') });
    await expect(
      harness.service.create(command(createSyntheticScheduleFixture())),
    ).rejects.toThrow('db-failed');
    expect(harness.storage.store).toHaveBeenCalledTimes(1);
    expect(harness.storage.delete).toHaveBeenCalledWith(
      'schedule-ocr://fixture.png',
    );
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

  it('terminal replay도 POST 계약상 QUEUED를 재응답하고 새 임시 파일은 삭제한다', async () => {
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
    expect(harness.storage.store).toHaveBeenCalledTimes(1);
    expect(harness.storage.delete).toHaveBeenCalledWith(
      'schedule-ocr://fixture.png',
    );
    expect(harness.gateway.recognize).not.toHaveBeenCalled();
    expect(harness.aiJobCreate).not.toHaveBeenCalled();
  });
});
