import { ApiProperty } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import {
  TASK_AI_CONFIDENCES,
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_STATUSES,
  type TaskAiConfidence,
  type TaskPriority,
  type TaskSource,
  type TaskStatus,
} from '../domain/task.types';

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

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
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

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
