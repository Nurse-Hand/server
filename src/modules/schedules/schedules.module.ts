import { Module } from '@nestjs/common';
import { MONTHLY_SCHEDULE_REPOSITORY } from './application/ports/monthly-schedule.repository';
import { MonthlyScheduleService } from './application/monthly-schedule.service';
import { PrismaMonthlyScheduleRepository } from './infrastructure/prisma-monthly-schedule.repository';
import { MonthlySchedulesController } from './presentation/monthly-schedules.controller';

@Module({
  controllers: [MonthlySchedulesController],
  providers: [
    MonthlyScheduleService,
    PrismaMonthlyScheduleRepository,
    {
      provide: MONTHLY_SCHEDULE_REPOSITORY,
      useExisting: PrismaMonthlyScheduleRepository,
    },
  ],
})
export class SchedulesModule {}
