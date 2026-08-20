import { Module } from '@nestjs/common';
import { HandoffDraftsModule } from '../handoffs/handoff-drafts.module';
import { HandoffPrechecksModule } from '../handoffs/handoff-prechecks.module';
import { TasksModule } from '../tasks/tasks.module';
import { TaskHandoffJobDispatcher } from './task-handoff-job.dispatcher';

@Module({
  imports: [TasksModule, HandoffPrechecksModule, HandoffDraftsModule],
  providers: [TaskHandoffJobDispatcher],
  exports: [TaskHandoffJobDispatcher],
})
export class JobExecutionModule {}
