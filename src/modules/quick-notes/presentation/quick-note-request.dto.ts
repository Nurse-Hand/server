import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QUICK_NOTE_TYPES, type QuickNoteType } from '../domain/quick-note.types';

const NON_WHITESPACE_PATTERN = /\S/;
const TIME_ZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const TEXT_MAX_LENGTH = 2000;
const MAX_PHOTO_ATTACHMENTS = 10;

export class CreateQuickNoteRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  patientId!: string;

  @ApiProperty({ enum: QUICK_NOTE_TYPES })
  @IsIn(QUICK_NOTE_TYPES)
  noteType!: QuickNoteType;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: TEXT_MAX_LENGTH,
    example: '보호자가 식사량 감소를 걱정한다고 메모했습니다.',
  })
  @IsOptional()
  @IsString()
  @Matches(NON_WHITESPACE_PATTERN)
  @MaxLength(TEXT_MAX_LENGTH)
  text?: string | null;

  @ApiPropertyOptional({ format: 'uuid', type: String })
  @IsOptional()
  @IsUUID('4')
  audioFileId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    isArray: true,
    maxItems: MAX_PHOTO_ATTACHMENTS,
    uniqueItems: true,
    type: String,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTO_ATTACHMENTS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  photoFileIds?: string[];

  @ApiProperty({
    example: '2026-08-20T10:14:00+09:00',
    format: 'date-time',
  })
  @IsISO8601({ strict: true })
  @Matches(TIME_ZONE_SUFFIX_PATTERN)
  occurredAt!: string;
}
