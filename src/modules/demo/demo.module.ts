import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DemoSessionContextResolver } from './application/demo-session-context.resolver';
import { DemoSessionService } from './application/demo-session.service';
import { NoLoginMvpContextResolver } from './application/no-login-mvp-context.resolver';
import { DemoScenarioSeeder } from './infrastructure/demo-scenario.seeder';
import { DemoModeGuard } from './presentation/demo-mode.guard';
import { DemoSessionGuard } from './presentation/demo-session.guard';
import { DemoSessionsController } from './presentation/demo-sessions.controller';

@Module({
  controllers: [DemoSessionsController],
  providers: [
    DemoModeGuard,
    DemoScenarioSeeder,
    DemoSessionContextResolver,
    NoLoginMvpContextResolver,
    DemoSessionGuard,
    { provide: APP_GUARD, useExisting: DemoSessionGuard },
    DemoSessionService,
  ],
  exports: [
    DemoModeGuard,
    DemoScenarioSeeder,
    DemoSessionContextResolver,
    NoLoginMvpContextResolver,
    DemoSessionGuard,
    DemoSessionService,
  ],
})
export class DemoModule {}
