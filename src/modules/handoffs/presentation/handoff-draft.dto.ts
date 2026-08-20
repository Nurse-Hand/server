import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import { seoulDateRange } from '../domain/seoul-work-date';
import {
  AI_JOB_STATUSES,
  DEFAULT_HANDOFF_PAGE_LIMIT,
  HANDOFF_DRAFT_LIST_STATUSES,
  HANDOFF_CLINICAL_SECTIONS,
  HANDOFF_EVIDENCE_EXCERPT_KINDS,
  HANDOFF_EVIDENCE_TYPES,
  HANDOFF_ROOT_STATUSES,
  HANDOFF_TARGET_DUTIES,
  HANDOFF_TEMPLATE_IDS,
  MAX_HANDOFF_CURSOR_LENGTH,
  MAX_HANDOFF_PAGE_LIMIT,
  MAX_HANDOFF_PATIENTS,
  MAX_HANDOFF_SECTION_LENGTH,
  MAX_HANDOFF_TASKS,
  MAX_VERSION,
  type AiJobStatus,
  type HandoffDraftListStatus,
  type HandoffEvidenceExcerptKind,
  type HandoffEvidenceType,
  type HandoffRootStatus,
  type HandoffTargetDuty,
  type HandoffTemplateId,
} from './handoff-draft-presentation.constants';

const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL'] as const;
type TaskPriority = (typeof TASK_PRIORITIES)[number];

export class HandoffDraftIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  handoffId!: string;
}

export class ListHandoffDraftsQueryDto {
  @ApiPropertyOptional({ format: 'date', example: '2026-08-13' })
  @IsOptional()
  @ValidateBy({
    name: 'isHandoffDate',
    validator: {
      validate(value: unknown): boolean {
        if (typeof value !== 'string') return false;
        try {
          seoulDateRange(value);
          return true;
        } catch {
          return false;
        }
      },
    },
  })
  date?: string;

  @ApiPropertyOptional({ enum: HANDOFF_DRAFT_LIST_STATUSES })
  @IsOptional()
  @IsIn(HANDOFF_DRAFT_LIST_STATUSES)
  status?: HandoffDraftListStatus;

  @ApiPropertyOptional({ maxLength: MAX_HANDOFF_CURSOR_LENGTH })
  @IsOptional()
  @IsString()
  @Length(1, MAX_HANDOFF_CURSOR_LENGTH)
  @Matches(/\S/)
  cursor?: string;

  @ApiPropertyOptional({
    default: DEFAULT_HANDOFF_PAGE_LIMIT,
    minimum: 1,
    maximum: MAX_HANDOFF_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HANDOFF_PAGE_LIMIT)
  limit: number = DEFAULT_HANDOFF_PAGE_LIMIT;
}

export class CreateHandoffDraftRequestDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      '기존 사전검증 결과로 초안을 생성할 때 사용합니다. MVP 초안 우선 흐름에서는 생략하고 shiftId/date/targetDuty를 전달합니다.',
  })
  @IsOptional()
  @IsUUID()
  precheckId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'precheckId 없이 초안을 먼저 생성할 때 사용할 현재 근무 ID',
  })
  @ValidateIf((body: CreateHandoffDraftRequestDto) => !body.precheckId)
  @IsUUID()
  shiftId?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-08-13',
    description: 'precheckId 없이 초안을 먼저 생성할 때 사용할 인수인계 날짜',
  })
  @ValidateIf((body: CreateHandoffDraftRequestDto) => !body.precheckId)
  @ValidateBy({
    name: 'isHandoffDate',
    validator: {
      validate(value: unknown): boolean {
        if (typeof value !== 'string') return false;
        try {
          seoulDateRange(value);
          return true;
        } catch {
          return false;
        }
      },
    },
  })
  date?: string;

  @ApiPropertyOptional({
    enum: HANDOFF_TARGET_DUTIES,
    description: 'precheckId 없이 초안을 먼저 생성할 때 받을 듀티',
  })
  @ValidateIf((body: CreateHandoffDraftRequestDto) => !body.precheckId)
  @IsIn(HANDOFF_TARGET_DUTIES)
  targetDuty?: HandoffTargetDuty;

  @ApiProperty({ enum: HANDOFF_TEMPLATE_IDS, example: 'NURSING_HANDOFF_V1' })
  @IsIn(HANDOFF_TEMPLATE_IDS)
  templateId!: HandoffTemplateId;

  @ApiProperty()
  @IsBoolean()
  includeUnverified!: boolean;
}

export class UpdateHandoffClinicalSectionsRequestDto {
  @ApiProperty({ maxLength: MAX_HANDOFF_SECTION_LENGTH })
  @IsString()
  @MaxLength(MAX_HANDOFF_SECTION_LENGTH)
  vitalSigns!: string;

  @ApiProperty({ maxLength: MAX_HANDOFF_SECTION_LENGTH })
  @IsString()
  @MaxLength(MAX_HANDOFF_SECTION_LENGTH)
  respiration!: string;

  @ApiProperty({ maxLength: MAX_HANDOFF_SECTION_LENGTH })
  @IsString()
  @MaxLength(MAX_HANDOFF_SECTION_LENGTH)
  mentalStatus!: string;

  @ApiProperty({ maxLength: MAX_HANDOFF_SECTION_LENGTH })
  @IsString()
  @MaxLength(MAX_HANDOFF_SECTION_LENGTH)
  pain!: string;

  @ApiProperty({ maxLength: MAX_HANDOFF_SECTION_LENGTH })
  @IsString()
  @MaxLength(MAX_HANDOFF_SECTION_LENGTH)
  treatment!: string;

  @ApiProperty({ maxLength: MAX_HANDOFF_SECTION_LENGTH })
  @IsString()
  @MaxLength(MAX_HANDOFF_SECTION_LENGTH)
  diet!: string;

  @ApiProperty({ maxLength: MAX_HANDOFF_SECTION_LENGTH })
  @IsString()
  @MaxLength(MAX_HANDOFF_SECTION_LENGTH)
  observation!: string;
}

export class UpdateHandoffPatientRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ type: UpdateHandoffClinicalSectionsRequestDto })
  @Type(() => UpdateHandoffClinicalSectionsRequestDto)
  @ValidateNested()
  sections!: UpdateHandoffClinicalSectionsRequestDto;
}

export class UpdateHandoffDraftRequestDto {
  @ApiProperty({
    type: UpdateHandoffPatientRequestDto,
    isArray: true,
    maxItems: MAX_HANDOFF_PATIENTS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_HANDOFF_PATIENTS)
  @ArrayUnique((patient: UpdateHandoffPatientRequestDto) => patient.patientId)
  @Type(() => UpdateHandoffPatientRequestDto)
  @ValidateNested({ each: true })
  patients!: UpdateHandoffPatientRequestDto[];

  @ApiProperty({ type: String, format: 'uuid', isArray: true })
  @IsArray()
  @ArrayMaxSize(MAX_HANDOFF_TASKS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  taskIds!: string[];

  @ApiProperty({ minimum: 1, maximum: MAX_VERSION })
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION)
  version!: number;
}

export class CreatedHandoffDraftDataDto {
  @ApiProperty({ format: 'uuid' })
  handoffId!: string;

  @ApiProperty({ enum: ['GENERATING'] })
  status!: 'GENERATING';
}

export class CreatedHandoffDraftResponseDto {
  @ApiProperty({ type: CreatedHandoffDraftDataDto })
  data!: CreatedHandoffDraftDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class HandoffDraftListItemDto {
  @ApiProperty({ format: 'uuid' })
  handoffId!: string;

  @ApiProperty({ enum: HANDOFF_DRAFT_LIST_STATUSES })
  status!: HandoffDraftListStatus;

  @ApiProperty({ minimum: 0 })
  patientCount!: number;

  @ApiProperty({ minimum: 0 })
  taskCount!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class HandoffDraftListDataDto {
  @ApiProperty({ type: HandoffDraftListItemDto, isArray: true })
  items!: HandoffDraftListItemDto[];
}

export class HandoffDraftListPageMetaDto {
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class HandoffDraftListMetaDto {
  @ApiProperty({ format: 'uuid' })
  requestId!: string;

  @ApiProperty({ type: HandoffDraftListPageMetaDto })
  page!: HandoffDraftListPageMetaDto;
}

export class HandoffDraftListResponseDto {
  @ApiProperty({ type: HandoffDraftListDataDto })
  data!: HandoffDraftListDataDto;

  @ApiProperty({ type: HandoffDraftListMetaDto })
  meta!: HandoffDraftListMetaDto;
}

export class HandoffGenerationJobDto {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ enum: AI_JOB_STATUSES })
  status!: AiJobStatus;

  @ApiPropertyOptional({ nullable: true })
  failureCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  retryable!: boolean | null;
}

export class HandoffDraftCitationDto {
  @ApiProperty({ enum: HANDOFF_EVIDENCE_TYPES })
  sourceType!: HandoffEvidenceType;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty()
  sourceReference!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  occurredAt!: string | null;

  @ApiProperty({ enum: HANDOFF_EVIDENCE_EXCERPT_KINDS })
  excerptKind!: HandoffEvidenceExcerptKind;

  @ApiProperty()
  excerpt!: string;

  @ApiProperty({ enum: HANDOFF_CLINICAL_SECTIONS })
  section!: string;

  @ApiProperty()
  wasModified!: boolean;
}

export class HandoffDraftClinicalSectionsDto {
  @ApiProperty() vitalSigns!: string;
  @ApiProperty() respiration!: string;
  @ApiProperty() mentalStatus!: string;
  @ApiProperty() pain!: string;
  @ApiProperty() treatment!: string;
  @ApiProperty() diet!: string;
  @ApiProperty() observation!: string;
}

export class HandoffDraftPatientDto {
  @ApiProperty({ format: 'uuid' }) patientId!: string;
  @ApiProperty({ type: HandoffDraftClinicalSectionsDto })
  sections!: HandoffDraftClinicalSectionsDto;
  @ApiProperty({ type: HandoffDraftClinicalSectionsDto })
  aiOriginalSections!: HandoffDraftClinicalSectionsDto;
  @ApiProperty({ type: HandoffDraftCitationDto, isArray: true })
  citations!: HandoffDraftCitationDto[];
  @ApiProperty() unverified!: boolean;
}

export class HandoffDraftTaskDto {
  @ApiProperty({ format: 'uuid' }) taskId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) patientId!:
    string | null;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) dueAt!:
    string | null;
  @ApiProperty({ enum: TASK_PRIORITIES }) effectivePriority!: TaskPriority;
  @ApiProperty({ minimum: 1 }) version!: number;
}

export class HandoffDraftWarningDto {
  @ApiProperty({ format: 'uuid' }) itemId!: string;
  @ApiProperty({ enum: ['CRITICAL', 'RECOMMENDED'] }) severity!: string;
  @ApiPropertyOptional({ nullable: true }) answer!: string | null;
  @ApiProperty() message!: string;
  @ApiProperty() isIncludedInAiInput!: boolean;
}

export class HandoffDraftDetailDataDto {
  @ApiProperty({ format: 'uuid' }) handoffId!: string;
  @ApiProperty({ enum: HANDOFF_ROOT_STATUSES }) status!: HandoffRootStatus;
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty({ format: 'uuid' }) senderActorId!: string;
  @ApiProperty({ format: 'uuid' }) receiverActorId!: string;
  @ApiProperty({ type: HandoffGenerationJobDto })
  generationJob!: HandoffGenerationJobDto;
  @ApiPropertyOptional({ enum: HANDOFF_TEMPLATE_IDS })
  templateId?: HandoffTemplateId;
  @ApiPropertyOptional() includeUnverified?: boolean;
  @ApiPropertyOptional({ type: HandoffDraftPatientDto, isArray: true })
  patients?: HandoffDraftPatientDto[];
  @ApiPropertyOptional({ type: HandoffDraftTaskDto, isArray: true })
  tasks?: HandoffDraftTaskDto[];
  @ApiPropertyOptional({ type: HandoffDraftWarningDto, isArray: true })
  warnings?: HandoffDraftWarningDto[];
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class HandoffDraftDetailResponseDto {
  @ApiProperty({ type: HandoffDraftDetailDataDto })
  data!: HandoffDraftDetailDataDto;
  @ApiProperty({ type: ApiMetaDto }) meta!: ApiMetaDto;
}

export class UpdatedHandoffDraftDataDto {
  @ApiProperty({ format: 'uuid' }) handoffId!: string;
  @ApiProperty({ enum: ['DRAFT'] }) status!: 'DRAFT';
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class UpdatedHandoffDraftResponseDto {
  @ApiProperty({ type: UpdatedHandoffDraftDataDto })
  data!: UpdatedHandoffDraftDataDto;
  @ApiProperty({ type: ApiMetaDto }) meta!: ApiMetaDto;
}
