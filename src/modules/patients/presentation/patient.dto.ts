import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type {
  PatientReadModel,
  PatientTimelineReadResult,
} from '../application/patient.models';

export class ListPatientTimelineQueryDto {
  @ApiPropertyOptional({
    description: 'Asia/Seoul 기준 조회 날짜. 지정하면 from/to보다 우선합니다.',
    example: '2026-08-20',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    type: String,
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate?: string;

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

  @ApiProperty({ example: 'P-301-01', nullable: true, type: String })
  patientCode!: string | null;

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

  @ApiProperty({ type: Boolean, default: false })
  important!: boolean;

  @ApiProperty({ enum: ['PENDING', 'CONFIRMED'] })
  confirmationStatus!: 'PENDING' | 'CONFIRMED';

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ example: 'timeline:event:801' })
  sourceReference!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  updatedByActorId!: string | null;
}

export class PatientTimelineDataDto {
  @ApiProperty({ type: PatientDataDto })
  patient!: PatientDataDto;

  @ApiProperty({
    example: '2026-08-20',
    nullable: true,
    type: String,
  })
  workDate!: string | null;

  @ApiProperty({
    example: '오늘 통증 NRS가 감소했고, 보행기 사용 가능 상태입니다.',
    nullable: true,
    type: String,
  })
  daySummary!: string | null;

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
    patientCode: patient.patientCode,
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
  timeline: PatientTimelineReadResult,
): PatientTimelineDataDto {
  return {
    patient: toPatientDataDto(timeline.patient),
    workDate: timeline.workDate,
    daySummary: timeline.daySummary,
    items: timeline.items.map((event) => ({
      timelineEventId: event.id,
      patientId: event.patientId,
      occurredAt: event.occurredAt.toISOString(),
      type: event.type,
      source: event.source,
      summary: event.summary,
      important: event.important ?? false,
      confirmationStatus: event.confirmationStatus ?? 'PENDING',
      version: event.version,
      sourceReference: event.sourceReference,
      updatedAt: (event.updatedAt ?? event.occurredAt).toISOString(),
      updatedByActorId: event.updatedByActorId ?? null,
    })),
  };
}
