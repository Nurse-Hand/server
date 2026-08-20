import { Module } from '@nestjs/common';
import { DATABASE_READINESS_PROBE } from './application/database-readiness.probe';
import { HealthService } from './application/health.service';
import { PrismaDatabaseReadinessProbe } from './infrastructure/prisma-database-readiness.probe';
import { HealthController } from './presentation/health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    PrismaDatabaseReadinessProbe,
    {
      provide: DATABASE_READINESS_PROBE,
      useExisting: PrismaDatabaseReadinessProbe,
    },
  ],
})
export class HealthModule {}
