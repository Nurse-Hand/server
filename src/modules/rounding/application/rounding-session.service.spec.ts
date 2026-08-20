import type { Clock } from '../../../common/time/clock';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RoundingSegmentPeriodInvalidError } from '../domain/rounding.errors';
import { RoundingSessionService } from './rounding-session.service';

describe('RoundingSessionService', () => {
  const context = {
    datasetId: '11111111-1111-4111-8111-111111111111',
    actorId: '22222222-2222-4222-8222-222222222222',
    wardId: '33333333-3333-4333-8333-333333333333',
  };

  it('시작 시각을 생략하면 Clock의 현재 시각으로 라운딩 세션을 만든다', async () => {
    const now = new Date('2026-08-19T00:00:00.000Z');
    const created = {
      id: '44444444-4444-4444-8444-444444444444',
      status: 'RECORDING' as const,
      actorId: context.actorId,
      wardId: context.wardId,
      startedAt: now,
      completedAt: null,
      note: 'day shift',
      version: 1,
      segments: [],
    };
    const prisma = {
      roundingSession: {
        create: jest.fn().mockResolvedValue(created),
      },
    } as unknown as PrismaService;
    const service = new RoundingSessionService(prisma, {
      now: () => now,
    } as Clock);

    await expect(
      service.start({ context, note: 'day shift' }),
    ).resolves.toEqual(created);
    expect(prisma.roundingSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          datasetId: context.datasetId,
          actorId: context.actorId,
          wardId: context.wardId,
          startedAt: now,
          note: 'day shift',
        }),
      }),
    );
  });

  it('환자 구간 종료 시각이 시작 시각보다 늦지 않으면 거부한다', async () => {
    const prisma = {
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new RoundingSessionService(prisma, {
      now: () => new Date('2026-08-19T00:00:00.000Z'),
    } as Clock);

    await expect(
      service.addPatientSegment({
        context,
        sessionId: '44444444-4444-4444-8444-444444444444',
        patientId: '55555555-5555-4555-8555-555555555555',
        startedAt: new Date('2026-08-19T01:00:00.000Z'),
        endedAt: new Date('2026-08-19T01:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(RoundingSegmentPeriodInvalidError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
