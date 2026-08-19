import { Module } from '@nestjs/common';
import { ROUNDING_SESSION_QUERY_PORT } from './application/ports/rounding-session-query.port';
import { RoundingSessionService } from './application/rounding-session.service';
import { PrismaRoundingSessionQueryAdapter } from './infrastructure/prisma-rounding-session-query.adapter';
import { RoundingSessionsController } from './presentation/rounding-sessions.controller';

@Module({
  controllers: [RoundingSessionsController],
  providers: [
    RoundingSessionService,
    PrismaRoundingSessionQueryAdapter,
    {
      provide: ROUNDING_SESSION_QUERY_PORT,
      useExisting: PrismaRoundingSessionQueryAdapter,
    },
  ],
  exports: [ROUNDING_SESSION_QUERY_PORT],
})
export class RoundingModule {}
