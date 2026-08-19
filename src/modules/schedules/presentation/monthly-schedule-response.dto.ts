import { ApiProperty } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type { MonthlyScheduleView } from '../application/ports/monthly-schedule.repository';
import {
  SCHEDULE_DUTIES,
  type ScheduleDuty,
} from '../domain/monthly-schedule.policy';

export class MonthlyScheduleEntryDto {
  @ApiProperty({ example: '2026-08-13', format: 'date' })
  date!: string;

  @ApiProperty({ enum: SCHEDULE_DUTIES })
  duty!: ScheduleDuty;
}

export class MonthlyScheduleTotalsDto {
  @ApiProperty({ minimum: 0 })
  DAY!: number;

  @ApiProperty({ minimum: 0 })
  EVENING!: number;

  @ApiProperty({ minimum: 0 })
  NIGHT!: number;

  @ApiProperty({ minimum: 0 })
  OFF!: number;
}

export class MonthlyScheduleDataDto {
  @ApiProperty({ example: '2026-08', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' })
  yearMonth!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ type: MonthlyScheduleEntryDto, isArray: true })
  entries!: MonthlyScheduleEntryDto[];

  @ApiProperty({ type: MonthlyScheduleTotalsDto })
  totals!: MonthlyScheduleTotalsDto;
}

export class MonthlyScheduleResponseDto {
  @ApiProperty({ type: MonthlyScheduleDataDto })
  data!: MonthlyScheduleDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function toMonthlyScheduleDataDto(
  schedule: MonthlyScheduleView,
): MonthlyScheduleDataDto {
  return {
    yearMonth: schedule.yearMonth,
    version: schedule.version,
    entries: schedule.entries.map((entry) => ({ ...entry })),
    totals: { ...schedule.totals },
  };
}
