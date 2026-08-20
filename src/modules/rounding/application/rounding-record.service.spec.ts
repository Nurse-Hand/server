import type { Clock } from '../../../common/time/clock';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RoundingRecordPeriodInvalidError } from '../domain/rounding.errors';
import { RoundingRecordService } from './rounding-record.service';

describe('RoundingRecordService', () => {
  const context = {
    datasetId: '11111111-1111-4111-8111-111111111111',
    actorId: '22222222-2222-4222-8222-222222222222',
    wardId: '33333333-3333-4333-8333-333333333333',
  };

  it('기록 종료 시각이 시작 시각보다 늦지 않으면 거부한다', async () => {
    const prisma = {
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new RoundingRecordService(
      prisma,
      { now: () => new Date('2026-08-20T00:00:00.000Z') } as Clock,
      { upload: jest.fn() } as never,
    );

    await expect(
      service.create({
        context,
        sessionId: '44444444-4444-4444-8444-444444444444',
        patientId: '55555555-5555-4555-8555-555555555555',
        startedAt: new Date('2026-08-20T01:00:00.000Z'),
        endedAt: new Date('2026-08-20T01:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(RoundingRecordPeriodInvalidError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
