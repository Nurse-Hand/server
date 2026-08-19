import type { Clock } from '../../../common/time/clock';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import {
  ScheduleOcrJobNotFoundError,
  ScheduleOcrResultExpiredError,
} from '../domain/schedule.errors';
import { MonthlyScheduleService } from './monthly-schedule.service';

const context = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000102',
  wardId: '00000000-0000-4000-8000-000000000103',
};
const now = new Date('2026-08-19T00:00:00.000Z');
const sourceJobId = '00000000-0000-4000-8000-000000000104';
const scheduleId = '00000000-0000-4000-8000-000000000105';

function createHarness(
  options: {
    currentVersion?: number;
    source?: { resultExpiresAt: Date | null } | null;
  } = {},
) {
  let saveRecord: {
    requestHash: string;
    scheduleId: string;
    wardId: string;
  } | null = null;
  let version = options.currentVersion;
  const scheduleOcrFind = jest.fn().mockResolvedValue(options.source ?? null);
  const tx = {
    scheduleOcrJob: { findFirst: scheduleOcrFind },
    monthlySchedule: {
      findUnique: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            version === undefined ? null : { id: scheduleId, version },
          ),
        ),
      create: jest.fn().mockImplementation(() => {
        version = 1;
        return Promise.resolve({ id: scheduleId });
      }),
      updateMany: jest.fn().mockImplementation(() => {
        version = (version ?? 0) + 1;
        return Promise.resolve({ count: 1 });
      }),
      findFirst: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({
            id: scheduleId,
            yearMonth: '2026-08',
            sourceJobId: null,
            version: version ?? 1,
            entries: [
              { dutyDate: new Date('2026-08-01T00:00:00.000Z'), duty: 'DAY' },
            ],
          }),
        ),
    },
    monthlyScheduleEntry: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    scheduleSaveRequest: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: { requestHash: string } }) => {
          saveRecord = {
            requestHash: data.requestHash,
            scheduleId,
            wardId: context.wardId,
          };
          return Promise.resolve({});
        }),
    },
  };
  const transaction = jest
    .fn()
    .mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
  const prisma = {
    ...tx,
    scheduleSaveRequest: {
      ...tx.scheduleSaveRequest,
      findUnique: jest
        .fn()
        .mockImplementation(() => Promise.resolve(saveRecord)),
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  const clock = { now: () => now } as Clock;
  return {
    service: new MonthlyScheduleService(prisma, clock),
    tx,
    transaction,
    scheduleOcrFind,
  };
}

const command = {
  context,
  yearMonth: '2026-08',
  sourceJobId: null,
  expectedVersion: 0,
  entries: [{ date: '2026-08-01', duty: 'DAY' as const }],
  idempotencyKey: 'save-1',
};

describe('MonthlyScheduleService', () => {
  it('sourceJobId 없이 완전 수동 일정을 저장하고 합계를 반환한다', async () => {
    const harness = createHarness();
    await expect(harness.service.put(command)).resolves.toMatchObject({
      sourceJobId: null,
      version: 1,
      totals: { DAY: 1 },
    });
    expect(harness.scheduleOcrFind).not.toHaveBeenCalled();
  });

  it('다른 scope이거나 없는 source job은 동일한 404로 숨긴다', async () => {
    const harness = createHarness({ source: null });
    await expect(
      harness.service.put({ ...command, sourceJobId }),
    ).rejects.toBeInstanceOf(ScheduleOcrJobNotFoundError);
  });

  it('24시간이 지난 source 후보는 저장에 사용하지 않는다', async () => {
    const harness = createHarness({
      source: { resultExpiresAt: new Date('2026-08-18T23:59:59.999Z') },
    });
    await expect(
      harness.service.put({ ...command, sourceJobId }),
    ).rejects.toBeInstanceOf(ScheduleOcrResultExpiredError);
  });

  it('version 충돌을 거부한다', async () => {
    const harness = createHarness({ currentVersion: 2 });
    await expect(
      harness.service.put({ ...command, expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('동일 멱등성 요청은 저장 transaction을 반복하지 않고 결과를 재생한다', async () => {
    const harness = createHarness();
    await harness.service.put(command);
    await harness.service.put(command);
    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });
});
