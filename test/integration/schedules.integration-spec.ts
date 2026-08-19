import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { Clock } from '../../src/common/time/clock';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionService } from '../../src/modules/demo/application/demo-session.service';
import type { ScheduleOcrGateway } from '../../src/modules/schedules/application/ports/schedule-ocr.gateway';
import type { ScheduleOcrStorage } from '../../src/modules/schedules/application/ports/schedule-ocr-storage.port';
import { MonthlyScheduleService } from '../../src/modules/schedules/application/monthly-schedule.service';
import { ScheduleOcrService } from '../../src/modules/schedules/application/schedule-ocr.service';
import {
  daysInYearMonth,
  SCHEDULE_OCR_ORPHAN_TTL_MS,
} from '../../src/modules/schedules/domain/schedule-policy';
import { createSyntheticScheduleFixture } from '../../src/modules/schedules/infrastructure/synthetic-schedule-fixture';
import { LocalScheduleOcrStorageAdapter } from '../../src/modules/schedules/infrastructure/local-schedule-ocr-storage.adapter';

class MutableClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(value: Date): void {
    this.current = new Date(value);
  }
}

describe('Schedules PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let context: DemoSessionContext;
  let secondContext: DemoSessionContext;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    context = await createContext(app);
    secondContext = await createContext(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('approved 합성 fixture는 유효한 PROCESSING claim을 거쳐 SUCCEEDED로 종결한다', async () => {
    const clock = new MutableClock(new Date());
    const storage = createStorage();
    const service = createService(clock, storage);
    const created = await service.create(createCommand(context));

    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: created.jobId } }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      attempt: 1,
      leaseVersion: 2,
      failureCode: null,
      retryable: null,
      resultReference: created.jobId,
    });
    await expect(
      prisma.scheduleOcrCell.count({ where: { aiJobId: created.jobId } }),
    ).resolves.toBe(31);
  });

  it('allowlist 밖 이미지는 파일을 저장하지 않고 DB 제약을 만족하는 FAILED Job을 남긴다', async () => {
    const clock = new MutableClock(new Date());
    const storage = createStorage();
    const service = createService(clock, storage);
    const created = await service.create(
      createCommand(context, createSyntheticScheduleFixture(641, 480)),
    );

    expect(storage.store).not.toHaveBeenCalled();
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: created.jobId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      attempt: 1,
      leaseVersion: 1,
      failureCode: 'SCHEDULE_OCR_ENGINE_UNAVAILABLE',
      retryable: false,
      resultReference: null,
    });
  });

  it('storage 정리 실패는 PROCESSING 원본 결과를 보존하고 재시도 뒤 한 번만 terminalize한다', async () => {
    const clock = new MutableClock(new Date());
    const storage = createStorage({
      storeError: new Error('write failed'),
      deleteErrors: [new Error('EACCES')],
    });
    const service = createService(clock, storage);
    let jobId = '';

    await expect(
      service.create(createCommand(context)).catch(async (error: unknown) => {
        const row = await prisma.scheduleOcrJob.findFirstOrThrow({
          where: {
            datasetId: context.datasetId,
            actorId: context.actorId,
            wardId: context.wardId,
            storageUri: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { aiJobId: true, updatedAt: true },
        });
        jobId = row.aiJobId;
        clock.set(
          new Date(row.updatedAt.getTime() + SCHEDULE_OCR_ORPHAN_TTL_MS + 1),
        );
        throw error;
      }),
    ).rejects.toThrow('EACCES');

    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } }),
    ).resolves.toMatchObject({ status: 'PROCESSING' });
    await expect(service.get(context, jobId)).resolves.toMatchObject({
      status: 'FAILED',
      failure: { code: 'SCHEDULE_OCR_CLEANUP_FAILED', retryable: true },
    });
    const staleFileRetryService = createService(
      clock,
      new LocalScheduleOcrStorageAdapter(
        new ConfigService({
          FILE_STORAGE_ROOT: join(
            process.cwd(),
            `.schedule-ocr-missing-${randomUUID()}`,
          ),
        }),
      ),
    );
    await expect(staleFileRetryService.retryPendingCleanup()).resolves.toBe(1);
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'SCHEDULE_OCR_STORAGE_FAILED',
      retryable: true,
    });
    await expect(
      prisma.aiJob.update({
        where: { id: jobId },
        data: { failureCode: 'TAMPERED_FAILURE' },
      }),
    ).rejects.toBeDefined();
  });

  it('source Job과 저장 요청의 cross-scope relation을 복합 FK가 거부한다', async () => {
    const source = await createService(
      new MutableClock(new Date()),
      createStorage(),
    ).create(createCommand(context));
    const schedule = await prisma.monthlySchedule.create({
      data: {
        ...context,
        yearMonth: '2026-08',
        sourceJobId: source.jobId,
      },
    });

    await expect(
      prisma.monthlySchedule.create({
        data: {
          ...secondContext,
          yearMonth: '2026-09',
          sourceJobId: source.jobId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.scheduleSaveRequest.create({
        data: {
          ...secondContext,
          yearMonth: '2026-08',
          idempotencyKey: `cross-${randomUUID()}`,
          requestHash: 'a'.repeat(64),
          scheduleId: schedule.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('다른 멱등성 키로 월 최초 생성을 동시에 요청하면 하나만 저장하고 패자는 version conflict다', async () => {
    const service = new MonthlyScheduleService(
      prisma,
      new MutableClock(new Date()),
    );
    const base = {
      context,
      yearMonth: '2027-01',
      sourceJobId: null,
      expectedVersion: 0,
      entries: [{ date: '2027-01-01', duty: 'DAY' as const }],
    };
    const results = await Promise.allSettled([
      service.put({ ...base, idempotencyKey: `first-${randomUUID()}` }),
      service.put({ ...base, idempotencyKey: `second-${randomUUID()}` }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = results.find(({ status }) => status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: 'VERSION_CONFLICT',
      publicDetails: { expectedVersion: 0, actualVersion: 1 },
    });
    await expect(
      prisma.monthlySchedule.count({
        where: { ...context, yearMonth: '2027-01' },
      }),
    ).resolves.toBe(1);
  });

  function createService(
    clock: Clock,
    storage: ScheduleOcrStorage,
  ): ScheduleOcrService {
    const gateway: ScheduleOcrGateway = {
      recognize: ({ yearMonth }) =>
        Promise.resolve(
          Array.from({ length: daysInYearMonth(yearMonth) }, (_, index) => ({
            day: index + 1,
            token: 'D' as const,
            confidence: 0.99,
          })),
        ),
    };
    return new ScheduleOcrService(
      prisma,
      clock,
      new ConfigService({ DEMO_MODE: true }),
      gateway,
      storage,
    );
  }
});

function createStorage(
  options: { storeError?: Error; deleteErrors?: Error[] } = {},
): jest.Mocked<ScheduleOcrStorage> {
  const deleteErrors = [...(options.deleteErrors ?? [])];
  return {
    resolveStorageUri: jest
      .fn()
      .mockImplementation(
        (jobId, extension) => `schedule-ocr://${jobId}${extension}`,
      ),
    store: options.storeError
      ? jest.fn().mockRejectedValue(options.storeError)
      : jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockImplementation(() => {
      const error = deleteErrors.shift();
      return error ? Promise.reject(error) : Promise.resolve();
    }),
  };
}

function createCommand(
  context: DemoSessionContext,
  image = createSyntheticScheduleFixture(),
) {
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
    idempotencyKey: `schedule-${randomUUID()}`,
    requestId: randomUUID(),
  };
}

async function createContext(
  app: INestApplication,
): Promise<DemoSessionContext> {
  const created = await app
    .get(DemoSessionService)
    .create('SYNTHETIC_MEDICAL_DAY_SHIFT');
  const sender = created.sessions.find(
    (session) => session.persona === 'SENDER',
  );
  if (!sender) throw new Error('SENDER demo session이 없습니다.');
  return app.get(DemoSessionContextResolver).resolve(sender.sessionId);
}
