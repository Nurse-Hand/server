import { ApiProperty } from '@nestjs/swagger';
import {
  ApiMetaDto,
  ApiPaginatedMetaDto,
} from '../../../common/http/api-response.dto';
import {
  TASK_AI_CONFIDENCES,
  TASK_EVIDENCE_SOURCE_TYPES,
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_STATUSES,
  type TaskAiConfidence,
  type TaskEvidenceSourceType,
  type TaskPriority,
  type TaskSource,
  type TaskStatus,
} from '../domain/task.types';

const TASK_EXTRACTION_JOB_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
] as const;

export type TaskExtractionJobStatus =
  (typeof TASK_EXTRACTION_JOB_STATUSES)[number];

export class TaskAiSuggestionDto {
  @ApiProperty({ enum: TASK_PRIORITIES })
  suggestedPriority!: TaskPriority;

  @ApiProperty({ isArray: true, type: String })
  reasons!: string[];

  @ApiProperty({ enum: TASK_AI_CONFIDENCES })
  confidence!: TaskAiConfidence;
}

export class TaskDataDto {
  @ApiProperty({ format: 'uuid' })
  taskId!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  patientId!: string | null;

  @ApiProperty({ example: '통증 재평가' })
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  dueAt!: string | null;

  @ApiProperty({ example: '2026-08-19', format: 'date' })
  workDate!: string;

  @ApiProperty({ enum: TASK_STATUSES })
  status!: TaskStatus;

  @ApiProperty({ enum: TASK_SOURCES })
  source!: TaskSource;

  @ApiProperty({ nullable: true, type: TaskAiSuggestionDto })
  aiSuggestion!: TaskAiSuggestionDto | null;

  @ApiProperty({ enum: TASK_PRIORITIES })
  rulePriority!: TaskPriority;

  @ApiProperty({ enum: TASK_PRIORITIES, nullable: true })
  confirmedPriority!: TaskPriority | null;

  @ApiProperty({ enum: TASK_PRIORITIES })
  effectivePriority!: TaskPriority;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class TaskListDataDto {
  @ApiProperty({ type: TaskDataDto, isArray: true })
  items!: TaskDataDto[];
}

export class TaskExtractionReservationDataDto {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ enum: TASK_EXTRACTION_JOB_STATUSES })
  status!: TaskExtractionJobStatus;
}

export class TaskExtractionEvidenceDto {
  @ApiProperty({ enum: TASK_EVIDENCE_SOURCE_TYPES })
  sourceType!: TaskEvidenceSourceType;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;
}

export class TaskExtractionCandidateDto {
  @ApiProperty({ format: 'uuid' })
  candidateId!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  patientId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  dueAt!: string | null;

  @ApiProperty({ format: 'date' })
  workDate!: string;

  @ApiProperty({ type: TaskAiSuggestionDto })
  aiSuggestion!: TaskAiSuggestionDto;

  @ApiProperty({ type: TaskExtractionEvidenceDto, isArray: true })
  evidence!: TaskExtractionEvidenceDto[];

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  duplicateTaskId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  appliedTaskId!: string | null;
}

export class TaskExtractionFailureDto {
  @ApiProperty({ example: 'TASK_AI_TIMEOUT' })
  code!: string;

  @ApiProperty()
  retryable!: boolean;
}

export class TaskExtractionJobDataDto {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ enum: TASK_EXTRACTION_JOB_STATUSES })
  status!: TaskExtractionJobStatus;

  @ApiProperty({ nullable: true, type: TaskExtractionFailureDto })
  failure!: TaskExtractionFailureDto | null;

  @ApiProperty({ type: TaskExtractionCandidateDto, isArray: true })
  candidates!: TaskExtractionCandidateDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ApplyTaskCandidatesDataDto {
  @ApiProperty({ format: 'uuid', isArray: true })
  createdTaskIds!: string[];

  @ApiProperty({ format: 'uuid', isArray: true })
  skippedCandidateIds!: string[];
}

export class TaskResponseDto {
  @ApiProperty({ type: TaskDataDto })
  data!: TaskDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class TaskListResponseDto {
  @ApiProperty({ type: TaskListDataDto })
  data!: TaskListDataDto;

  @ApiProperty({ type: ApiPaginatedMetaDto })
  meta!: ApiPaginatedMetaDto;
}

export class TaskExtractionReservationResponseDto {
  @ApiProperty({ type: TaskExtractionReservationDataDto })
  data!: TaskExtractionReservationDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class TaskExtractionJobResponseDto {
  @ApiProperty({ type: TaskExtractionJobDataDto })
  data!: TaskExtractionJobDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class ApplyTaskCandidatesResponseDto {
  @ApiProperty({ type: ApplyTaskCandidatesDataDto })
  data!: ApplyTaskCandidatesDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
