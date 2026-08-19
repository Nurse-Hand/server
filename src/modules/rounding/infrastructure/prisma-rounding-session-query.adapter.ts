import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { RoundingSessionQueryPort } from '../application/ports/rounding-session-query.port';
import { RoundingSessionNotFoundError } from '../domain/rounding.errors';

@Injectable()
export class PrismaRoundingSessionQueryAdapter implements RoundingSessionQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async assertCompleted(input: {
    context: { datasetId: string; actorId: string; wardId: string };
    roundingSessionId: string;
    recordIds: readonly string[];
  }): Promise<void> {
    const session = await this.prisma.roundingSession.findFirst({
      where: {
        id: input.roundingSessionId,
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        segments: {
          where: { id: { in: [...input.recordIds] } },
          select: { id: true },
        },
      },
    });

    if (
      session === null ||
      session.segments.length !== input.recordIds.length
    ) {
      throw new RoundingSessionNotFoundError();
    }
  }
}
