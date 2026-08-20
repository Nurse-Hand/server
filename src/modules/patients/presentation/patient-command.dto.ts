import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const NON_WHITESPACE_PATTERN = /\S/;
const DISPLAY_NAME_MAX_LENGTH = 100;
const ROOM_LABEL_MAX_LENGTH = 32;
const PATIENT_CODE_MAX_LENGTH = 32;
const STATUS_LABEL_MAX_LENGTH = 20;
const DEPARTMENT_MAX_LENGTH = 50;
const BASELINE_SUMMARY_MAX_LENGTH = 500;
const TIME_ZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

export class CreatePatientRequestDto {
  @ApiProperty({ example: '환자 C', maxLength: DISPLAY_NAME_MAX_LENGTH })
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(DISPLAY_NAME_MAX_LENGTH)
  displayName!: string;

  @ApiProperty({ example: '212호 1번 침상', maxLength: ROOM_LABEL_MAX_LENGTH })
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(ROOM_LABEL_MAX_LENGTH)
  roomLabel!: string;

  @ApiPropertyOptional({
    example: 'P-212-01',
    maxLength: PATIENT_CODE_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PATIENT_CODE_MAX_LENGTH)
  patientCode?: string | null;

  @ApiPropertyOptional({
    example: '주의',
    maxLength: STATUS_LABEL_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(STATUS_LABEL_MAX_LENGTH)
  statusLabel?: string | null;

  @ApiPropertyOptional({
    example: '정형외과',
    maxLength: DEPARTMENT_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(DEPARTMENT_MAX_LENGTH)
  department?: string | null;

  @ApiPropertyOptional({
    example: '2026-08-20T09:00:00+09:00',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TIME_ZONE_SUFFIX_PATTERN)
  admittedAt?: string | null;

  @ApiPropertyOptional({
    example: 'CT 결과 대기 중이며 활력징후 안정적',
    maxLength: BASELINE_SUMMARY_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(BASELINE_SUMMARY_MAX_LENGTH)
  baselineSummary?: string | null;
}

export class UpdatePatientRequestDto {
  @ApiPropertyOptional({
    example: '환자 C',
    maxLength: DISPLAY_NAME_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(DISPLAY_NAME_MAX_LENGTH)
  displayName?: string;

  @ApiPropertyOptional({
    example: '212호 1번 침상',
    maxLength: ROOM_LABEL_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(ROOM_LABEL_MAX_LENGTH)
  roomLabel?: string;

  @ApiPropertyOptional({
    example: 'P-212-01',
    maxLength: PATIENT_CODE_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PATIENT_CODE_MAX_LENGTH)
  patientCode?: string | null;

  @ApiPropertyOptional({
    example: '주의',
    maxLength: STATUS_LABEL_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(STATUS_LABEL_MAX_LENGTH)
  statusLabel?: string | null;

  @ApiPropertyOptional({
    example: '정형외과',
    maxLength: DEPARTMENT_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(DEPARTMENT_MAX_LENGTH)
  department?: string | null;

  @ApiPropertyOptional({
    example: '2026-08-20T09:00:00+09:00',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TIME_ZONE_SUFFIX_PATTERN)
  admittedAt?: string | null;

  @ApiPropertyOptional({
    example: 'CT 결과 대기 중이며 활력징후 안정적',
    maxLength: BASELINE_SUMMARY_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(BASELINE_SUMMARY_MAX_LENGTH)
  baselineSummary?: string | null;
}

export class DischargePatientRequestDto {
  @ApiPropertyOptional({
    description: '퇴원 처리 시각. 생략하면 서버 현재 시각을 사용합니다.',
    example: '2026-08-20T18:00:00+09:00',
    format: 'date-time',
    type: String,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TIME_ZONE_SUFFIX_PATTERN)
  dischargedAt?: string;
}
