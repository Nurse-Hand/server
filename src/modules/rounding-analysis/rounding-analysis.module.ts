import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { ClockModule } from '../../common/time/clock.module';
import { RoundingAnalysisService } from './application/rounding-analysis.service';
import { RoundingAnalysisController } from './presentation/rounding-analysis.controller';

@Module({
  imports: [PrismaModule, ClockModule],
  controllers: [RoundingAnalysisController],
  providers: [RoundingAnalysisService],
})
export class RoundingAnalysisModule {}
