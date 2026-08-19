import { Module } from '@nestjs/common';
import { HandoffActivityModule } from './handoff-activity.module';
import { HandoffDraftsModule } from './handoff-drafts.module';
import { HandoffFinalizationModule } from './handoff-finalization.module';
import { HandoffPrechecksModule } from './handoff-prechecks.module';

@Module({
  imports: [
    HandoffPrechecksModule,
    HandoffDraftsModule,
    HandoffFinalizationModule,
    HandoffActivityModule,
  ],
})
export class HandoffsModule {}
