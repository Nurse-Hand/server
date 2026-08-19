import { Module } from '@nestjs/common';
import { RoundingSessionService } from './application/rounding-session.service';
import { RoundingSessionsController } from './presentation/rounding-sessions.controller';

@Module({
  controllers: [RoundingSessionsController],
  providers: [RoundingSessionService],
})
export class RoundingModule {}
