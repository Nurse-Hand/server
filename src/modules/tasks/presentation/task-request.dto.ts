import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TASK_LIST_SORTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskListSort,
  type TaskPriority,
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

export class CreateTaskRequestDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID('4')
  patientId?: string | null;

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

  @ApiProperty({ minimum: 1, type: Number })
  @IsInt()
  @Min(1)
  @HasTaskPatchField({
    message: 'version 외에 수정할 업무 필드를 하나 이상 전달해야 합니다.',
  })
  version!: number;
}
