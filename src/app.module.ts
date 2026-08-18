import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
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
