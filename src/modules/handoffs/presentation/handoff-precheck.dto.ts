import {
  ArrayMaxSize,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import {
  AI_JOB_STATUSES,
  HANDOFF_PRECHECK_ANSWERS,
  HANDOFF_PRECHECK_SEVERITIES,
  HANDOFF_EVIDENCE_EXCERPT_KINDS,
  HANDOFF_EVIDENCE_TYPES,
  MAX_HANDOFF_COMMENT_LENGTH,
  MAX_VERSION,
  SHIFT_DUTIES,
  type AiJobStatus,
  type HandoffPrecheckAnswer,
  type HandoffPrecheckSeverity,
  type HandoffEvidenceExcerptKind,
  type HandoffEvidenceType,
  type ShiftDuty,
} from './handoff-precheck-presentation.constants';

export class PrecheckIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  precheckId!: string;
}

export class PrecheckItemIdParamsDto extends PrecheckIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;
}

export class CreateHandoffPrecheckRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shiftId!: string;

  @ApiProperty({ enum: SHIFT_DUTIES, example: 'EVENING' })
  @IsIn(SHIFT_DUTIES)
  targetDuty!: ShiftDuty;

  @ApiProperty({ format: 'date', example: '2026-08-13' })
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class AnswerHandoffPrecheckItemRequestDto {
  @ApiProperty({ enum: HANDOFF_PRECHECK_ANSWERS })
  @IsIn(HANDOFF_PRECHECK_ANSWERS)
  answer!: HandoffPrecheckAnswer;

  @ApiPropertyOptional({
    maxLength: MAX_HANDOFF_COMMENT_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_HANDOFF_COMMENT_LENGTH)
  comment?: string | null;

  @ApiProperty({ minimum: 1, maximum: MAX_VERSION })
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION)
  version!: number;
}

export class CreatedHandoffPrecheckDataDto {
  @ApiProperty({ format: 'uuid' })
  precheckId!: string;

  @ApiProperty({ enum: ['QUEUED'] })
  status!: 'QUEUED';
}

export class CreatedHandoffPrecheckResponseDto {
  @ApiProperty({ type: CreatedHandoffPrecheckDataDto })
  data!: CreatedHandoffPrecheckDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class HandoffPrecheckSummaryDto {
  @ApiProperty({ minimum: 0 })
  critical!: number;

  @ApiProperty({ minimum: 0 })
  recommended!: number;
}

export class HandoffPrecheckEvidenceDto {
  @ApiProperty({ enum: HANDOFF_EVIDENCE_TYPES })
  sourceType!: HandoffEvidenceType;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty({
    description: '입력 snapshot에 보존된 source reference',
  })
  sourceReference!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  occurredAt!: string | null;

  @ApiProperty({ enum: HANDOFF_EVIDENCE_EXCERPT_KINDS })
  excerptKind!: HandoffEvidenceExcerptKind;

  @ApiProperty({ description: '근거로 펼쳐 볼 snapshot 텍스트' })
  excerpt!: string;
}

export class HandoffPrecheckItemDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ enum: HANDOFF_PRECHECK_SEVERITIES })
  severity!: HandoffPrecheckSeverity;

  @ApiProperty()
  question!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ type: HandoffPrecheckEvidenceDto, isArray: true })
  @ArrayMaxSize(500)
  evidence!: HandoffPrecheckEvidenceDto[];

  @ApiPropertyOptional({
    enum: HANDOFF_PRECHECK_ANSWERS,
    nullable: true,
  })
  answer!: HandoffPrecheckAnswer | null;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiProperty({ minimum: 1 })
  version!: number;
}

export class HandoffPrecheckDataDto {
  @ApiProperty({ format: 'uuid' })
  precheckId!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ enum: AI_JOB_STATUSES })
  status!: AiJobStatus;

  @ApiPropertyOptional({ nullable: true })
  failureCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  retryable?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  modelVersion!: string | null;

  @ApiPropertyOptional({ nullable: true })
  contractVersion!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  generatedAt!: string | null;

  @ApiPropertyOptional({ type: HandoffPrecheckSummaryDto })
  summary?: HandoffPrecheckSummaryDto;

  @ApiPropertyOptional({ type: HandoffPrecheckItemDto, isArray: true })
  items?: HandoffPrecheckItemDto[];
}

export class HandoffPrecheckResponseDto {
  @ApiProperty({ type: HandoffPrecheckDataDto })
  data!: HandoffPrecheckDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class AnsweredHandoffPrecheckItemDataDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ enum: HANDOFF_PRECHECK_ANSWERS })
  answer!: HandoffPrecheckAnswer;

  @ApiProperty({ minimum: 1 })
  version!: number;
}

export class AnsweredHandoffPrecheckItemResponseDto {
  @ApiProperty({ type: AnsweredHandoffPrecheckItemDataDto })
  data!: AnsweredHandoffPrecheckItemDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
