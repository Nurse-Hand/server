import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_LIST_SORTS,
  TASK_PRIORITIES,
  TASK_PRIORITY_SIGNAL_LEVELS,
  TASK_SCOPE_TYPES,
  TASK_STATUSES,
  type TaskListSort,
  type TaskPriority,
  type TaskPrioritySignalLevel,
  type TaskScopeType,
  type TaskStatus,
} from '../domain/task.types';

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1_000;
const CURSOR_MAX_LENGTH = 1_024;
const TASK_BATCH_MAX_SIZE = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const NON_WHITESPACE_PATTERN = /\S/;

const TASK_PATCH_FIELDS = [
  'title',
  'description',
  'dueAt',
  'status',
  'scopeType',
  'patientId',
  'locationLabel',
  'isCarryOver',
  'dependencyTaskIds',
  'priorityMeta',
  'priorityOverride',
] as const;

function HasTaskPatchField(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'hasTaskPatchField',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          if (typeof args.object !== 'object' || args.object === null) {
            return false;
          }

          const request = args.object as Record<string, unknown>;

          return TASK_PATCH_FIELDS.some(
            (field) =>
              Object.prototype.hasOwnProperty.call(request, field) &&
              request[field] !== undefined,
          );
        },
      },
    });
  };
}

export class ListTasksQueryDto {
  @ApiProperty({
    description: 'Asia/Seoul 기준 업무일',
    example: '2026-08-19',
    format: 'date',
  })
  @IsISO8601({ strict: true })
  @Matches(DATE_PATTERN)
  date!: string;

  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ format: 'uuid', type: String })
  @IsOptional()
  @IsUUID('4')
  patientId?: string;

  @ApiPropertyOptional({
    default: 'priority',
    enum: TASK_LIST_SORTS,
  })
  @IsOptional()
  @IsIn(TASK_LIST_SORTS)
  sort: TaskListSort = 'priority';

  @ApiPropertyOptional({
    description: '서버가 발급한 opaque cursor',
    maxLength: CURSOR_MAX_LENGTH,
    type: String,
  })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class TaskPriorityMetaRequestDto {
  @ApiPropertyOptional({ enum: TASK_PRIORITY_SIGNAL_LEVELS, nullable: true })
  @IsOptional()
  @IsIn(TASK_PRIORITY_SIGNAL_LEVELS)
  patientStatusUrgency?: TaskPrioritySignalLevel | null;

  @ApiPropertyOptional({ enum: TASK_PRIORITY_SIGNAL_LEVELS, nullable: true })
  @IsOptional()
  @IsIn(TASK_PRIORITY_SIGNAL_LEVELS)
  timeSensitivity?: TaskPrioritySignalLevel | null;

  @ApiPropertyOptional({ enum: TASK_PRIORITY_SIGNAL_LEVELS, nullable: true })
  @IsOptional()
  @IsIn(TASK_PRIORITY_SIGNAL_LEVELS)
  taskCriticality?: TaskPrioritySignalLevel | null;

  @ApiPropertyOptional({ default: false, type: Boolean })
  @IsOptional()
  @IsBoolean()
  isBlocking?: boolean;
}

export class CreateTaskRequestDto {
  @ApiPropertyOptional({ enum: TASK_SCOPE_TYPES })
  @IsOptional()
  @IsIn(TASK_SCOPE_TYPES)
  scopeType?: TaskScopeType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID('4')
  patientId?: string | null;

  @ApiPropertyOptional({
    description: '병동 운영 업무 위치 또는 표시 라벨',
    example: '물품 창고',
    maxLength: 100,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(100)
  locationLabel?: string | null;

  @ApiProperty({ example: '통증 재평가', maxLength: TITLE_MAX_LENGTH })
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(TITLE_MAX_LENGTH)
  title!: string;

  @ApiPropertyOptional({
    example: '진통제 투여 후 통증 점수를 다시 확인합니다.',
    maxLength: DESCRIPTION_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiProperty({
    example: '2026-08-19T14:00:00+09:00',
    format: 'date-time',
  })
  @IsISO8601({ strict: true })
  @Matches(TIME_ZONE_SUFFIX_PATTERN)
  dueAt!: string;

  @ApiPropertyOptional({
    enum: TASK_PRIORITIES,
    nullable: true,
  })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priorityOverride?: TaskPriority | null;

  @ApiPropertyOptional({ default: false, type: Boolean })
  @IsOptional()
  @IsBoolean()
  isCarryOver?: boolean;

  @ApiPropertyOptional({
    description: '이 업무보다 먼저 완료되어야 하는 업무 ID 목록',
    format: 'uuid',
    isArray: true,
    maxItems: TASK_BATCH_MAX_SIZE,
    type: String,
    uniqueItems: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TASK_BATCH_MAX_SIZE)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  dependencyTaskIds?: string[];

  @ApiPropertyOptional({ type: () => TaskPriorityMetaRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaskPriorityMetaRequestDto)
  priorityMeta?: TaskPriorityMetaRequestDto;
}

export class CreateTaskPrioritySuggestionRequestDto {
  @ApiProperty({
    description: 'Asia/Seoul 기준 업무일',
    example: '2026-08-19',
    format: 'date',
  })
  @IsISO8601({ strict: true })
  @Matches(DATE_PATTERN)
  date!: string;
}

export class ReserveTaskExtractionRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  roundingSessionId!: string;

  @ApiProperty({
    format: 'uuid',
    isArray: true,
    maxItems: TASK_BATCH_MAX_SIZE,
    minItems: 1,
    uniqueItems: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TASK_BATCH_MAX_SIZE)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  recordIds!: string[];
}

export class UpdateTaskRequestDto {
  @ApiPropertyOptional({ enum: TASK_SCOPE_TYPES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(TASK_SCOPE_TYPES)
  scopeType?: TaskScopeType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID('4')
  patientId?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(100)
  locationLabel?: string | null;

  @ApiPropertyOptional({ example: '통증 재평가', maxLength: TITLE_MAX_LENGTH })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    maxLength: DESCRIPTION_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @ApiPropertyOptional({
    description: 'null 변경은 도메인 규칙에 따라 422로 거부됩니다.',
    example: '2026-08-19T15:00:00+09:00',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TIME_ZONE_SUFFIX_PATTERN)
  dueAt?: string | null;

  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, nullable: true })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priorityOverride?: TaskPriority | null;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isCarryOver?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    isArray: true,
    maxItems: TASK_BATCH_MAX_SIZE,
    type: String,
    uniqueItems: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TASK_BATCH_MAX_SIZE)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  dependencyTaskIds?: string[];

  @ApiPropertyOptional({ type: () => TaskPriorityMetaRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaskPriorityMetaRequestDto)
  priorityMeta?: TaskPriorityMetaRequestDto;

  @ApiPropertyOptional({
    description: 'AI 제안을 그대로 수락할 때 함께 전달하는 제안 식별자',
    format: 'uuid',
    type: String,
  })
  @IsOptional()
  @IsUUID('4')
  prioritySuggestionId?: string;

  @ApiProperty({ minimum: 1, type: Number })
  @IsInt()
  @Min(1)
  @HasTaskPatchField({
    message: 'version 외에 수정할 업무 필드를 하나 이상 전달해야 합니다.',
  })
  version!: number;
}

export class ApplyTaskCandidateRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  candidateId!: string;

  @ApiProperty({
    description: '실제 업무로 반영할 후보인지 여부',
    example: true,
  })
  @IsBoolean()
  selected!: boolean;

  @ApiPropertyOptional({ maxLength: TITLE_MAX_LENGTH })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    description: 'null이면 후보 업무의 마감을 제거합니다.',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(TIME_ZONE_SUFFIX_PATTERN)
  dueAt?: string | null;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, nullable: true })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priorityOverride?: TaskPriority | null;
}

export class ApplyTaskCandidatesRequestDto {
  @ApiProperty({ type: ApplyTaskCandidateRequestDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TASK_BATCH_MAX_SIZE)
  @ArrayUnique((item: unknown) => {
    if (typeof item === 'object' && item !== null && 'candidateId' in item) {
      return item.candidateId;
    }
    return item;
  })
  @ValidateNested({ each: true })
  @Type(() => ApplyTaskCandidateRequestDto)
  items!: ApplyTaskCandidateRequestDto[];
}
