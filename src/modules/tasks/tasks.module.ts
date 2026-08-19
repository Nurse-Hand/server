import { Module } from '@nestjs/common';
import { TASK_REPOSITORY } from './application/ports/task.repository';
import { TaskService } from './application/task.service';
import { PrismaTaskRepository } from './infrastructure/prisma-task.repository';
import { TasksController } from './presentation/tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [
    TaskService,
    PrismaTaskRepository,
    { provide: TASK_REPOSITORY, useExisting: PrismaTaskRepository },
  ],
})
export class TasksModule {}
