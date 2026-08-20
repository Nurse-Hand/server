import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  type ValidationArguments,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import {
  TIMELINE_EVENT_CONFIRMATION_STATUSES,
  TIMELINE_EVENT_SOURCES,
  TIMELINE_EVENT_TYPES,
  type TimelineEventConfirmationStatus,
  type TimelineEventSource,
  type TimelineEventType,
} from '../domain/timeline.types';

const SUMMARY_MAX_LENGTH = 500;
const PATCH_FIELDS = ['summary', 'important', 'confirmationStatus'] as const;

function HasTimelinePatchField(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'hasTimelinePatchField',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          if (typeof args.object !== 'object' || args.object === null) {
            return false;
          }

          const request = args.object as Record<string, unknown>;

          return PATCH_FIELDS.some(
            (field) =>
              Object.prototype.hasOwnProperty.call(request, field) &&
              request[field] !== undefined,
          );
        },
      },
    });
  };
}

export class TimelineEventIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  eventId!: string;
}

export class UpdateTimelineEventRequestDto {
  @ApiPropertyOptional({
    example: '통증 NRS 4점으로 감소, 오후 재평가 필요',
    maxLength: SUMMARY_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(SUMMARY_MAX_LENGTH)
  summary?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  important?: boolean;

  @ApiPropertyOptional({ enum: TIMELINE_EVENT_CONFIRMATION_STATUSES })
  @IsOptional()
  @IsIn(TIMELINE_EVENT_CONFIRMATION_STATUSES)
  confirmationStatus?: TimelineEventConfirmationStatus;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @HasTimelinePatchField({
    message: 'version 외에 수정할 Timeline 이벤트 필드가 하나 이상 필요합니다.',
  })
  version!: number;
}

export class TimelineEventDataDto {
  @ApiProperty({ format: 'uuid' })
  eventId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ enum: TIMELINE_EVENT_TYPES })
  type!: TimelineEventType;

  @ApiProperty({ enum: TIMELINE_EVENT_SOURCES })
  source!: TimelineEventSource;

  @ApiProperty({ example: 'timeline:event:801' })
  sourceReference!: string;

  @ApiProperty({ example: '통증 NRS 4점으로 감소' })
  summary!: string;

  @ApiProperty({ type: Boolean })
  important!: boolean;

  @ApiProperty({ enum: TIMELINE_EVENT_CONFIRMATION_STATUSES })
  confirmationStatus!: TimelineEventConfirmationStatus;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  updatedByActorId!: string | null;
}

export class TimelineEventResponseDto {
  @ApiProperty({ type: TimelineEventDataDto })
  data!: TimelineEventDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class TimelineEventHistoryChangeTextDto {
  @ApiProperty()
  before!: string;

  @ApiProperty()
  after!: string;
}

export class TimelineEventHistoryChangeBooleanDto {
  @ApiProperty({ type: Boolean })
  before!: boolean;

  @ApiProperty({ type: Boolean })
  after!: boolean;
}

export class TimelineEventHistoryChangeStatusDto {
  @ApiProperty({ enum: TIMELINE_EVENT_CONFIRMATION_STATUSES })
  before!: TimelineEventConfirmationStatus;

  @ApiProperty({ enum: TIMELINE_EVENT_CONFIRMATION_STATUSES })
  after!: TimelineEventConfirmationStatus;
}

export class TimelineEventHistoryChangesDto {
  @ApiPropertyOptional({ type: TimelineEventHistoryChangeTextDto })
  summary?: TimelineEventHistoryChangeTextDto;

  @ApiPropertyOptional({ type: TimelineEventHistoryChangeBooleanDto })
  important?: TimelineEventHistoryChangeBooleanDto;

  @ApiPropertyOptional({ type: TimelineEventHistoryChangeStatusDto })
  confirmationStatus?: TimelineEventHistoryChangeStatusDto;
}

export class TimelineEventHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  historyEntryId!: string;

  @ApiProperty({ format: 'uuid' })
  actorId!: string;

  @ApiProperty({ format: 'date-time' })
  editedAt!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ type: TimelineEventHistoryChangesDto })
  changes!: TimelineEventHistoryChangesDto;
}

export class TimelineEventHistoryDataDto {
  @ApiProperty({ type: TimelineEventHistoryItemDto, isArray: true })
  items!: TimelineEventHistoryItemDto[];
}

export class TimelineEventHistoryResponseDto {
  @ApiProperty({ type: TimelineEventHistoryDataDto })
  data!: TimelineEventHistoryDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
