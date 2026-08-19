import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type { MonthlyScheduleReadModel } from '../application/monthly-schedule.service';
import { SCHEDULE_DUTIES } from '../domain/schedule-policy';

export class MonthlyScheduleEntryRequestDto {
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  date!: string;
  @ApiProperty({ enum: SCHEDULE_DUTIES })
  @IsIn(SCHEDULE_DUTIES)
  duty!: (typeof SCHEDULE_DUTIES)[number];
}

export class PutMonthlyScheduleRequestDto {
  @ApiProperty({ minimum: 0, description: '신규 생성은 0' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  sourceJobId?: string | null;
  @ApiProperty({ type: MonthlyScheduleEntryRequestDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => MonthlyScheduleEntryRequestDto)
  entries!: MonthlyScheduleEntryRequestDto[];
}

export class MonthlyScheduleEntryDto {
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty({ enum: SCHEDULE_DUTIES })
  duty!: (typeof SCHEDULE_DUTIES)[number];
}
export class MonthlyScheduleTotalsDto {
  @ApiProperty() DAY!: number;
  @ApiProperty() EVENING!: number;
  @ApiProperty() NIGHT!: number;
  @ApiProperty() OFF!: number;
}
export class MonthlyScheduleDataDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-08' }) yearMonth!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) sourceJobId!:
    string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ type: MonthlyScheduleEntryDto, isArray: true })
  entries!: MonthlyScheduleEntryDto[];
  @ApiProperty({ type: MonthlyScheduleTotalsDto })
  totals!: MonthlyScheduleTotalsDto;
}
export class MonthlyScheduleResponseDto {
  @ApiProperty({ type: MonthlyScheduleDataDto }) data!: MonthlyScheduleDataDto;
  @ApiProperty({ type: ApiMetaDto }) meta!: ApiMetaDto;
}
export function mapMonthlyScheduleDto(
  model: MonthlyScheduleReadModel,
): MonthlyScheduleDataDto {
  return { ...model };
}
