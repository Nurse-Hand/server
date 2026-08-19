import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type {
  PatientReadModel,
  PatientTimelineReadModel,
} from '../application/patient.models';

export class ListPatientTimelineQueryDto {
  @ApiPropertyOptional({ format: 'date-time', type: String })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', type: String })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class PatientDataDto {
  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ example: '환자 A' })
  displayName!: string;

  @ApiProperty({ example: '301호 1번 침상' })
  roomLabel!: string;

  @ApiProperty({ nullable: true, type: String })
  statusLabel!: string | null;

  @ApiProperty({ nullable: true, type: String })
  department!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  admittedAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  baselineSummary!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class PatientListDataDto {
  @ApiProperty({ isArray: true, type: PatientDataDto })
  items!: PatientDataDto[];
}

export class PatientListResponseDto {
  @ApiProperty({ type: PatientListDataDto })
  data!: PatientListDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class PatientResponseDto {
  @ApiProperty({ type: PatientDataDto })
  data!: PatientDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class PatientTimelineEventDto {
  @ApiProperty({ format: 'uuid' })
  timelineEventId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({
    enum: ['OBSERVATION', 'MEDICATION', 'PROCEDURE', 'REPORT', 'TASK'],
  })
  type!: 'OBSERVATION' | 'MEDICATION' | 'PROCEDURE' | 'REPORT' | 'TASK';

  @ApiProperty({ enum: ['MANUAL', 'AI_AUDIO'] })
  source!: 'MANUAL' | 'AI_AUDIO';

  @ApiProperty({ example: '통증 NRS 5점으로 감소' })
  summary!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ example: 'timeline:event:801' })
  sourceReference!: string;
}

export class PatientTimelineDataDto {
  @ApiProperty({ isArray: true, type: PatientTimelineEventDto })
  items!: PatientTimelineEventDto[];
}

export class PatientTimelineResponseDto {
  @ApiProperty({ type: PatientTimelineDataDto })
  data!: PatientTimelineDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function toPatientDataDto(patient: PatientReadModel): PatientDataDto {
  return {
    patientId: patient.patientId,
    displayName: patient.displayName,
    roomLabel: patient.roomLabel,
    statusLabel: patient.statusLabel,
    department: patient.department,
    admittedAt: patient.admittedAt?.toISOString() ?? null,
    baselineSummary: patient.baselineSummary,
    createdAt: patient.createdAt.toISOString(),
  };
}

export function toPatientListDataDto(
  patients: readonly PatientReadModel[],
): PatientListDataDto {
  return {
    items: patients.map(toPatientDataDto),
  };
}

export function toPatientTimelineDataDto(
  timeline: readonly PatientTimelineReadModel[],
): PatientTimelineDataDto {
  return {
    items: timeline.map((event) => ({
      timelineEventId: event.id,
      patientId: event.patientId,
      occurredAt: event.occurredAt.toISOString(),
      type: event.type,
      source: event.source,
      summary: event.summary,
      version: event.version,
      sourceReference: event.sourceReference,
    })),
  };
}
