import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../common/time/clock';
import type { EnvironmentVariables } from '../../../config/environment';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DemoScenarioSeeder } from '../infrastructure/demo-scenario.seeder';
import { NoLoginMvpContextResolver } from './no-login-mvp-context.resolver';

describe('NoLoginMvpContextResolver', () => {
  const datasetId = '00000000-0000-4000-8000-000000000101';
  const wardId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2026-08-20T05:00:00.000Z');

  let prisma: {
    $transaction: jest.Mock;
  };
  let transaction: {
    demoDataset: {
      upsert: jest.Mock;
    };
  };
  let seeder: {
    seed: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let clock: {
    now: jest.Mock;
  };

  beforeEach(() => {
    transaction = {
      demoDataset: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    seeder = {
      seed: jest.fn().mockResolvedValue({
        actorId,
        patientIds: [],
        nurseIds: [actorId],
        receiverId: '33333333-3333-4333-8333-333333333333',
        senderShiftEndsAt: new Date('2026-08-20T12:00:00.000Z'),
        timelineEventIds: [],
        wardId,
      }),
    };
    configService = {
      get: jest.fn().mockReturnValue(datasetId),
    };
    clock = {
      now: jest.fn().mockReturnValue(now),
    };
  });

  it('resolve를 호출할 때마다 no-login MVP scenario를 다시 seed한다', async () => {
    const resolver = new NoLoginMvpContextResolver(
      prisma as unknown as PrismaService,
      seeder as unknown as DemoScenarioSeeder,
      configService as unknown as ConfigService<EnvironmentVariables, true>,
      clock as unknown as Clock,
    );

    await expect(resolver.resolve()).resolves.toEqual({
      actorId,
      datasetId,
      wardId,
    });
    await expect(resolver.resolve()).resolves.toEqual({
      actorId,
      datasetId,
      wardId,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.demoDataset.upsert).toHaveBeenCalledTimes(2);
    expect(seeder.seed).toHaveBeenCalledTimes(2);
  });
});
