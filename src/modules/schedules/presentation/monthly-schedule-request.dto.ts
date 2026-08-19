import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SCHEDULE_DUTIES,
  type ScheduleDuty,
} from '../domain/monthly-schedule.policy';

export class MonthlyScheduleEntryRequestDto {
  @ApiProperty({ example: '2026-08-13', format: 'date' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  date!: string;

  @ApiProperty({ enum: SCHEDULE_DUTIES })
  @IsIn(SCHEDULE_DUTIES)
  duty!: ScheduleDuty;
}

export class PutMonthlyScheduleRequestDto {
  @ApiProperty({ description: '신규 저장은 0', minimum: 0 })
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ApiProperty({ type: MonthlyScheduleEntryRequestDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(31)
  @ArrayUnique((entry: unknown) => {
    if (typeof entry === 'object' && entry !== null && 'date' in entry) {
      return entry.date;
    }
    return entry;
  })
  @ValidateNested({ each: true })
  @Type(() => MonthlyScheduleEntryRequestDto)
  entries!: MonthlyScheduleEntryRequestDto[];
}
