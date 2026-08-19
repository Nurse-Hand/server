import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, Matches } from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type { ScheduleOcrJobReadModel } from '../application/schedule-ocr.service';
import { SCHEDULE_OCR_SUPPORTED_TEMPLATES } from '../domain/schedule-policy';

export class CreateScheduleOcrJobRequestDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: unknown;

  @ApiProperty({ example: '2026-08' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  yearMonth!: string;

  @ApiProperty({ enum: SCHEDULE_OCR_SUPPORTED_TEMPLATES })
  @IsIn(SCHEDULE_OCR_SUPPORTED_TEMPLATES)
  templateId!: string;

  @ApiProperty({ enum: [2] })
  @Transform(({ value }) => parseStrictInteger(value))
  @IsInt()
  @IsIn([2])
  rowIndex!: number;
}

export class ScheduleOcrCandidateDto {
  @ApiProperty({ format: 'date' })
  date!: string;
  @ApiProperty({ enum: ['D', 'E', 'N', 'OFF', 'UNKNOWN'] })
  token!: string;
  @ApiProperty({ minimum: 0, maximum: 1 })
  confidence!: number;
  @ApiProperty()
  needsReview!: boolean;
}

export class ScheduleOcrJobDataDto {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;
  @ApiProperty({ enum: ['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED'] })
  status!: string;
  @ApiProperty({ example: '2026-08' })
  yearMonth!: string;
  @ApiProperty()
  templateId!: string;
  @ApiProperty()
  rowIndex!: number;
  @ApiPropertyOptional({ type: Object, nullable: true })
  failure!: { code: string; retryable: boolean; message: string } | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resultExpiresAt!: string | null;
  @ApiProperty({ type: ScheduleOcrCandidateDto, isArray: true })
  candidates!: ScheduleOcrCandidateDto[];
}

export class ScheduleOcrJobResponseDto {
  @ApiProperty({ type: ScheduleOcrJobDataDto })
  data!: ScheduleOcrJobDataDto;
  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function mapScheduleOcrJobDto(
  model: ScheduleOcrJobReadModel,
): ScheduleOcrJobDataDto {
  return {
    ...model,
    resultExpiresAt: model.resultExpiresAt?.toISOString() ?? null,
  };
}

function parseStrictInteger(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    return Number(value);
  }
  return value;
}
