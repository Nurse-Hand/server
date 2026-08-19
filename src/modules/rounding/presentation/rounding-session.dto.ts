import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type { RoundingSessionReadModel } from '../application/rounding-session.types';

export class StartRoundingSessionRequestDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: '생략하면 서버 현재 시각을 사용한다.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startedAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AddRoundingPatientSegmentRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  patientId!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  endedAt!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CompleteRoundingSessionRequestDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: '생략하면 서버 현재 시각을 사용한다.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  completedAt?: string;
}

export class RoundingPatientSegmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiProperty({ nullable: true })
  note!: string | null;
}

export class RoundingSessionDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['RECORDING', 'COMPLETED'] })
  status!: 'RECORDING' | 'COMPLETED';

  @ApiProperty({ format: 'uuid' })
  actorId!: string;

  @ApiProperty({ format: 'uuid' })
  wardId!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: RoundingPatientSegmentDto, isArray: true })
  segments!: RoundingPatientSegmentDto[];
}

export class RoundingSessionResponseDto {
  @ApiProperty({ type: RoundingSessionDataDto })
  data!: RoundingSessionDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function mapRoundingSessionDto(
  session: RoundingSessionReadModel,
): RoundingSessionDataDto {
  return {
    id: session.id,
    status: session.status,
    actorId: session.actorId,
    wardId: session.wardId,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    note: session.note,
    version: session.version,
    segments: session.segments.map((segment) => ({
      id: segment.id,
      patientId: segment.patientId,
      sequence: segment.sequence,
      startedAt: segment.startedAt.toISOString(),
      endedAt: segment.endedAt.toISOString(),
      note: segment.note,
    })),
  };
}
