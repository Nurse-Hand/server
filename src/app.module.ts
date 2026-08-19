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
import { HealthModule } from './modules/health/health.module';
import { RoundingModule } from './modules/rounding/rounding.module';
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
    HealthModule,
    RoundingModule,
    TimelineModule,
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
