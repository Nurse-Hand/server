import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClockModule } from './common/time/clock.module';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { JobExecutionModule } from './modules/job-execution/job-execution.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ClockModule,
    PrismaModule,
    JobExecutionModule,
  ],
})
export class WorkerAppModule {}
