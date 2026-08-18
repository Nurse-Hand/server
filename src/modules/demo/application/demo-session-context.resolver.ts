import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  DemoSessionExpiredError,
  DemoSessionInvalidError,
} from '../domain/demo-session.errors';
import { digestDemoSessionToken } from '../domain/demo-session-token';
import type { DemoSessionContext } from './demo-session-context';

@Injectable()
export class DemoSessionContextResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async resolve(sessionId: string): Promise<DemoSessionContext> {
    const session = await this.prisma.demoSession.findUnique({
      where: { tokenDigest: digestDemoSessionToken(sessionId) },
      select: {
        datasetId: true,
        actorNurseId: true,
        wardId: true,
        expiresAt: true,
      },
    });

    if (!session) {
      throw new DemoSessionInvalidError();
    }

    if (session.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw new DemoSessionExpiredError();
    }

    return {
      datasetId: session.datasetId,
      actorId: session.actorNurseId,
      wardId: session.wardId,
    };
  }
}
