import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type {
  RoundingAnalysisConfirmationResult,
  RoundingAnalysisJobReadModel,
  RoundingEvidenceReadModel,
  RoundingEvidenceTopic,
  RoundingSpeakerRole,
} from '../application/rounding-analysis.models';

const SPEAKER_ROLES = [
  'NURSE',
  'PATIENT_CANDIDATE',
  'THIRD_PARTY',
  'UNKNOWN',
] as const;

const EVIDENCE_TOPICS = [
  'VITAL_SIGNS',
  'RESPIRATION',
  'MENTAL_STATUS',
  'PAIN',
  'TREATMENT',
  'DIET',
  'OBSERVATION',
] as const;

export class StartRoundingAnalysisJobRequestDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      '전체 라운딩 녹음 파일 ID. 생략하면 세션 구간만으로 mock 분석한다.',
  })
  @IsOptional()
  @IsUUID()
  audioFileId?: string;
}

export class ConfirmRoundingUtteranceRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  utteranceId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: '간호사가 확정한 환자 ID. 간호사/제3자 발화는 null 가능.',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string | null;

  @ApiPropertyOptional({ enum: SPEAKER_ROLES })
  @IsOptional()
  @IsIn(SPEAKER_ROLES)
  speakerRole?: RoundingSpeakerRole;

  @ApiPropertyOptional({
    description: '인수인계 근거로 반드시 남길 발화 여부',
  })
  @IsOptional()
  @IsBoolean()
  important?: boolean;
}

export class ConfirmRoundingAnalysisRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  jobId!: string;

  @ApiProperty({ type: ConfirmRoundingUtteranceRequestDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmRoundingUtteranceRequestDto)
  utterances!: ConfirmRoundingUtteranceRequestDto[];
}

export class ListRoundingEvidenceQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ enum: EVIDENCE_TOPICS })
  @IsOptional()
  @IsIn(EVIDENCE_TOPICS)
  topic?: RoundingEvidenceTopic;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class RoundingAnalysisUtteranceDto {
  @ApiProperty({ format: 'uuid' })
  utteranceId!: string;

  @ApiProperty()
  speakerLabel!: string;

  @ApiProperty({ enum: SPEAKER_ROLES })
  speakerRole!: RoundingSpeakerRole;

  @ApiProperty({ format: 'uuid', nullable: true })
  patientId!: string | null;

  @ApiProperty()
  startedAtMs!: number;

  @ApiProperty()
  endedAtMs!: number;

  @ApiProperty()
  text!: string;

  @ApiProperty({ nullable: true })
  confidence!: number | null;

  @ApiProperty()
  important!: boolean;
}

export class RoundingSpeakerMatchDto {
  @ApiProperty()
  speakerLabel!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  candidatePatientId!: string | null;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  similarity!: number;
}

export class RoundingAnalysisJobDto {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ enum: ['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED'] })
  status!: RoundingAnalysisJobReadModel['status'];

  @ApiProperty({ format: 'uuid' })
  roundingSessionId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  audioFileId!: string | null;

  @ApiProperty({ nullable: true })
  fullText!: string | null;

  @ApiProperty({ type: RoundingAnalysisUtteranceDto, isArray: true })
  utterances!: RoundingAnalysisUtteranceDto[];

  @ApiProperty({ type: RoundingSpeakerMatchDto, isArray: true })
  speakerMatches!: RoundingSpeakerMatchDto[];

  @ApiProperty({ nullable: true })
  failureCode!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class RoundingEvidenceDto {
  @ApiProperty({ format: 'uuid' })
  evidenceId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ enum: EVIDENCE_TOPICS })
  topic!: RoundingEvidenceTopic;

  @ApiProperty()
  handoffSection!: string;

  @ApiProperty({ type: String, isArray: true })
  keywords!: string[];

  @ApiProperty({ type: String, isArray: true })
  importanceFlags!: string[];

  @ApiProperty()
  requiresNurseConfirmation!: boolean;

  @ApiProperty()
  textForRetrieval!: string;

  @ApiProperty({ type: String, isArray: true })
  sourceUtteranceIds!: string[];

  @ApiProperty({ format: 'uuid', nullable: true })
  timelineEventId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class RoundingAnalysisConfirmationDto {
  @ApiProperty({ type: RoundingAnalysisJobDto })
  job!: RoundingAnalysisJobDto;

  @ApiProperty({ type: RoundingEvidenceDto, isArray: true })
  evidences!: RoundingEvidenceDto[];

  @ApiProperty({ type: String, isArray: true })
  timelineEventIds!: string[];
}

export class RoundingAnalysisJobResponseDto {
  @ApiProperty({ type: RoundingAnalysisJobDto })
  data!: RoundingAnalysisJobDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class RoundingAnalysisConfirmationResponseDto {
  @ApiProperty({ type: RoundingAnalysisConfirmationDto })
  data!: RoundingAnalysisConfirmationDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class RoundingEvidenceListResponseDto {
  @ApiProperty({ type: RoundingEvidenceDto, isArray: true })
  data!: RoundingEvidenceDto[];

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function toRoundingAnalysisJobDto(
  job: RoundingAnalysisJobReadModel,
): RoundingAnalysisJobDto {
  return {
    jobId: job.jobId,
    status: job.status,
    roundingSessionId: job.roundingSessionId,
    audioFileId: job.audioFileId,
    fullText: job.fullText,
    utterances: job.utterances.map((utterance) => ({ ...utterance })),
    speakerMatches: job.speakerMatches.map((match) => ({ ...match })),
    failureCode: job.failureCode,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function toRoundingEvidenceDto(
  evidence: RoundingEvidenceReadModel,
): RoundingEvidenceDto {
  return {
    evidenceId: evidence.evidenceId,
    patientId: evidence.patientId,
    topic: evidence.topic,
    handoffSection: evidence.handoffSection,
    keywords: [...evidence.keywords],
    importanceFlags: [...evidence.importanceFlags],
    requiresNurseConfirmation: evidence.requiresNurseConfirmation,
    textForRetrieval: evidence.textForRetrieval,
    sourceUtteranceIds: [...evidence.sourceUtteranceIds],
    timelineEventId: evidence.timelineEventId,
    createdAt: evidence.createdAt.toISOString(),
  };
}

export function toRoundingAnalysisConfirmationDto(
  result: RoundingAnalysisConfirmationResult,
): RoundingAnalysisConfirmationDto {
  return {
    job: toRoundingAnalysisJobDto(result.job),
    evidences: result.evidences.map(toRoundingEvidenceDto),
    timelineEventIds: [...result.timelineEventIds],
  };
}
