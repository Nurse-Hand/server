import { Module } from '@nestjs/common';
import { HandoffsModule } from '../handoffs/handoffs.module';
import { TasksModule } from '../tasks/tasks.module';
import { TaskHandoffJobDispatcher } from './task-handoff-job.dispatcher';

@Module({
  imports: [TasksModule, HandoffsModule],
  providers: [TaskHandoffJobDispatcher],
  exports: [TaskHandoffJobDispatcher],
})
export class JobExecutionModule {}
