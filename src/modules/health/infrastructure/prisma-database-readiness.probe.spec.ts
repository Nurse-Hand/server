import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PrismaDatabaseReadinessProbe } from './prisma-database-readiness.probe';

describe('PrismaDatabaseReadinessProbe', () => {
  it('PostgreSQL에 최소 readiness query를 실행한다', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaDatabaseReadinessProbe,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();
    const probe = moduleRef.get(PrismaDatabaseReadinessProbe);

    await expect(probe.check()).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
