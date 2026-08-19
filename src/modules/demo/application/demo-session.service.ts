import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoScenarioKey } from '../domain/demo-scenario';
import type { DemoSessionPersona } from '../domain/demo-session-persona';
import {
  createDemoSessionToken,
  digestDemoSessionToken,
} from '../domain/demo-session-token';
import { DemoScenarioSeeder } from '../infrastructure/demo-scenario.seeder';

export type CreatedDemoSession = {
  scenarioKey: DemoScenarioKey;
  expiresAt: Date;
  sessions: readonly {
    persona: DemoSessionPersona;
    sessionId: string;
  }[];
};

@Injectable()
export class DemoSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seeder: DemoScenarioSeeder,
    private readonly configService: ConfigService,
    private readonly clock: Clock,
  ) {}

  async create(scenarioKey: DemoScenarioKey): Promise<CreatedDemoSession> {
    const sessions = [
      { persona: 'SENDER' as const, sessionId: createDemoSessionToken() },
      { persona: 'RECEIVER' as const, sessionId: createDemoSessionToken() },
    ];
    const now = this.clock.now();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'DEMO_SESSION_TTL_SECONDS',
    );
    let expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.prisma.$transaction(async (transaction) => {
      const dataset = await transaction.demoDataset.create({
        data: { scenarioKey },
        select: { id: true },
      });
      const seeded = await this.seeder.seed(
        transaction,
        dataset.id,
        scenarioKey,
        now,
      );

      if (expiresAt.getTime() > seeded.senderShiftEndsAt.getTime()) {
        expiresAt = seeded.senderShiftEndsAt;
      }

      await transaction.demoSession.createMany({
        data: sessions.map(({ persona, sessionId }) => ({
          datasetId: dataset.id,
          tokenDigest: digestDemoSessionToken(sessionId),
          actorNurseId:
            persona === 'SENDER' ? seeded.actorId : seeded.receiverId,
          wardId: seeded.wardId,
          expiresAt,
          createdAt: now,
        })),
      });
    });

    return { scenarioKey, expiresAt, sessions };
  }
}
