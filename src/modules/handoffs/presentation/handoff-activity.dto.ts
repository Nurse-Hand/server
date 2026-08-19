import { Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApiMetaDto,
  ApiPaginatedMetaDto,
} from '../../../common/http/api-response.dto';
import {
  HANDOFF_HISTORY_EVENT_TYPES,
  type HandoffHistoryEventType,
} from '../application/handoff-activity.models';
import {
  HANDOFF_ACKNOWLEDGEMENT_STATUSES,
  HANDOFF_UNVERIFIED_HANDLINGS,
  type HandoffAcknowledgementStatus,
  type HandoffUnverifiedHandling,
} from '../domain/handoff.constants';

export const MAX_HANDOFF_HISTORY_CURSOR_LENGTH = 512;
export const MAX_HANDOFF_ACKNOWLEDGEMENT_COMMENT_LENGTH = 1000;
export const MAX_HANDOFF_HISTORY_LIMIT = 100;

export class HandoffActivityIdParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() handoffId!: string;
}
export class CreateHandoffAcknowledgementRequestDto {
  @ApiProperty({ enum: HANDOFF_ACKNOWLEDGEMENT_STATUSES })
  @IsIn(HANDOFF_ACKNOWLEDGEMENT_STATUSES)
  status!: HandoffAcknowledgementStatus;
  @ApiPropertyOptional({
    nullable: true,
    maxLength: MAX_HANDOFF_ACKNOWLEDGEMENT_COMMENT_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_HANDOFF_ACKNOWLEDGEMENT_COMMENT_LENGTH)
  comment?: string | null;
}
export class HandoffAcknowledgementDataDto {
  @ApiProperty({ format: 'uuid' }) acknowledgementId!: string;
  @ApiProperty({ enum: HANDOFF_ACKNOWLEDGEMENT_STATUSES })
  status!: HandoffAcknowledgementStatus;
  @ApiProperty({ format: 'date-time' }) acknowledgedAt!: string;
}
export class HandoffAcknowledgementResponseDto {
  @ApiProperty({ type: HandoffAcknowledgementDataDto })
  data!: HandoffAcknowledgementDataDto;
  @ApiProperty({ type: ApiMetaDto }) meta!: ApiMetaDto;
}
export class HandoffHistoryQueryDto {
  @ApiPropertyOptional({ maxLength: MAX_HANDOFF_HISTORY_CURSOR_LENGTH })
  @IsOptional()
  @IsString()
  @Length(1, MAX_HANDOFF_HISTORY_CURSOR_LENGTH)
  @Matches(/\S/)
  cursor?: string;
  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: MAX_HANDOFF_HISTORY_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HANDOFF_HISTORY_LIMIT)
  limit?: number;
}
export class HandoffHistoryMetadataDto {
  @ApiPropertyOptional({ minimum: 1 }) generationSequence?: number;
  @ApiPropertyOptional({ minimum: 1 }) version?: number;
  @ApiPropertyOptional({ enum: HANDOFF_UNVERIFIED_HANDLINGS })
  unverifiedHandling?: HandoffUnverifiedHandling;
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' })
  warningItemIds?: string[];
  @ApiPropertyOptional({ enum: HANDOFF_ACKNOWLEDGEMENT_STATUSES })
  status?: HandoffAcknowledgementStatus;
}
export class HandoffHistoryEventDto {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ enum: HANDOFF_HISTORY_EVENT_TYPES })
  type!: HandoffHistoryEventType;
  @ApiProperty({ format: 'uuid' }) actorId!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ type: HandoffHistoryMetadataDto })
  metadata!: HandoffHistoryMetadataDto;
}
export class HandoffHistoryDataDto {
  @ApiProperty({ type: HandoffHistoryEventDto, isArray: true })
  items!: HandoffHistoryEventDto[];
}
export class HandoffHistoryResponseDto {
  @ApiProperty({ type: HandoffHistoryDataDto }) data!: HandoffHistoryDataDto;
  @ApiProperty({ type: ApiPaginatedMetaDto }) meta!: ApiPaginatedMetaDto;
}
