import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { ClockModule } from './common/time/clock.module';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AiJobsModule } from './modules/ai-jobs/ai-jobs.module';
import { DemoModule } from './modules/demo/demo.module';
import { FilesModule } from './modules/files/files.module';
import { HandoffsModule } from './modules/handoffs/handoffs.module';
import { HealthModule } from './modules/health/health.module';
import { PatientsModule } from './modules/patients/patients.module';
import { RoundingAnalysisModule } from './modules/rounding-analysis/rounding-analysis.module';
import { RoundingModule } from './modules/rounding/rounding.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TimelineModule } from './modules/timeline/timeline.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ClockModule,
    PrismaModule,
    DemoModule,
    AiJobsModule,
    FilesModule,
    HealthModule,
    PatientsModule,
    RoundingModule,
    RoundingAnalysisModule,
    SchedulesModule,
    TimelineModule,
    TasksModule,
    HandoffsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({
      method: RequestMethod.ALL,
      path: '{*splat}',
    });
  }
}
