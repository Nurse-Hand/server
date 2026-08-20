import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type {
  RoundingAudioChunkReadModel,
  RoundingRecordListView,
  RoundingRecordReadModel,
} from '../application/rounding-record.types';
import { toRoundingRecordDate } from '../application/rounding-record.service';

export class CreateRoundingRecordRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  endedAt!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  audioFileId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RoundingRecordItemDto {
  @ApiProperty({ format: 'uuid' })
  recordId!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty()
  patientDisplayName!: string;

  @ApiProperty()
  patientRoomLabel!: string;

  @ApiProperty({ format: 'uuid' })
  actorId!: string;

  @ApiProperty({ format: 'uuid' })
  wardId!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ description: '라운딩 기록 근무일(YYYY-MM-DD)' })
  workDate!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  audioFileId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class CreatedRoundingRecordDataDto extends RoundingRecordItemDto {}

export class RoundingRecordListDataDto {
  @ApiProperty({ description: '조회 기준 일자(YYYY-MM-DD)' })
  date!: string;

  @ApiProperty({ type: RoundingRecordItemDto, isArray: true })
  items!: RoundingRecordItemDto[];
}

export class RoundingAudioChunkDataDto {
  @ApiProperty({ format: 'uuid' })
  chunkId!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  audioFileId!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  originalName!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  checksum!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class RoundingRecordResponseDto {
  @ApiProperty({ type: CreatedRoundingRecordDataDto })
  data!: CreatedRoundingRecordDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class RoundingRecordListResponseDto {
  @ApiProperty({ type: RoundingRecordListDataDto })
  data!: RoundingRecordListDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class RoundingAudioChunkResponseDto {
  @ApiProperty({ type: RoundingAudioChunkDataDto })
  data!: RoundingAudioChunkDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function mapRoundingRecordDto(
  record: RoundingRecordReadModel,
): RoundingRecordItemDto {
  return {
    recordId: record.id,
    sessionId: record.sessionId,
    patientId: record.patientId,
    patientDisplayName: record.patientDisplayName,
    patientRoomLabel: record.patientRoomLabel,
    actorId: record.actorId,
    wardId: record.wardId,
    sequence: record.sequence,
    workDate: toRoundingRecordDate(record.workDate),
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt.toISOString(),
    note: record.note,
    audioFileId: record.audioFileId,
    createdAt: record.createdAt.toISOString(),
  };
}

export function mapCreatedRoundingRecordDto(
  record: RoundingRecordReadModel,
): CreatedRoundingRecordDataDto {
  return mapRoundingRecordDto(record);
}

export function mapRoundingRecordListDto(
  list: RoundingRecordListView,
): RoundingRecordListDataDto {
  return {
    date: toRoundingRecordDate(list.date),
    items: list.items.map(mapRoundingRecordDto),
  };
}

export function mapRoundingAudioChunkDto(
  chunk: RoundingAudioChunkReadModel,
): RoundingAudioChunkDataDto {
  return {
    chunkId: chunk.id,
    sessionId: chunk.sessionId,
    audioFileId: chunk.audioFileId,
    mimeType: chunk.mimeType,
    originalName: chunk.originalName,
    sizeBytes: chunk.sizeBytes,
    checksum: chunk.checksum,
    createdAt: chunk.createdAt.toISOString(),
  };
}
