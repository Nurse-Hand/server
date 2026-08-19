import type {
  ListTasksResult,
  ReserveTaskExtractionResult,
  TaskExtractionCandidateView,
  TaskExtractionJobView,
  TaskView,
} from '../application/ports/task.repository';
import type {
  TaskAiSuggestionDto,
  TaskDataDto,
  TaskExtractionCandidateDto,
  TaskExtractionJobDataDto,
  TaskExtractionReservationDataDto,
  TaskListDataDto,
} from './task-response.dto';

const PUBLIC_FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const FALLBACK_EXTRACTION_FAILURE_CODE = 'TASK_EXTRACTION_FAILED';

export function toTaskDataDto(task: TaskView): TaskDataDto {
  return {
    taskId: task.id,
    patientId: task.patientId,
    title: task.title,
    description: task.description,
    dueAt: toNullableDateTime(task.dueAt),
    workDate: toDateOnly(task.workDate),
    status: task.status,
    source: task.source,
    aiSuggestion: toTaskAiSuggestionDto(task),
    rulePriority: task.rulePriority,
    confirmedPriority: task.confirmedPriority,
    effectivePriority: task.effectivePriority,
    version: task.version,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toTaskListDataDto(result: ListTasksResult): TaskListDataDto {
  return {
    items: result.items.map(toTaskDataDto),
    nextCursor: result.nextCursor,
  };
}

export function toTaskExtractionReservationDataDto(
  result: ReserveTaskExtractionResult,
): TaskExtractionReservationDataDto {
  return {
    jobId: result.jobId,
    status: result.status,
  };
}

export function toTaskExtractionJobDataDto(
  job: TaskExtractionJobView,
): TaskExtractionJobDataDto {
  return {
    jobId: job.jobId,
    status: job.status,
    failure: toTaskExtractionFailureDto(job),
    candidates:
      job.status === 'SUCCEEDED'
        ? job.candidates.map(toTaskExtractionCandidateDto)
        : [],
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function toTaskExtractionFailureDto(
  job: TaskExtractionJobView,
): TaskExtractionJobDataDto['failure'] {
  if (job.status !== 'FAILED') {
    return null;
  }

  return {
    code:
      job.failureCode !== null &&
      PUBLIC_FAILURE_CODE_PATTERN.test(job.failureCode)
        ? job.failureCode
        : FALLBACK_EXTRACTION_FAILURE_CODE,
    retryable: job.retryable === true,
  };
}

function toTaskAiSuggestionDto(task: TaskView): TaskAiSuggestionDto | null {
  if (task.aiSuggestedPriority === null || task.aiConfidence === null) {
    return null;
  }

  return {
    suggestedPriority: task.aiSuggestedPriority,
    reasons: [...task.aiReasons],
    confidence: task.aiConfidence,
  };
}

function toTaskExtractionCandidateDto(
  candidate: TaskExtractionCandidateView,
): TaskExtractionCandidateDto {
  return {
    candidateId: candidate.id,
    patientId: candidate.patientId,
    title: candidate.title,
    description: candidate.description,
    dueAt: toNullableDateTime(candidate.dueAt),
    workDate: toDateOnly(candidate.workDate),
    aiSuggestion: {
      suggestedPriority: candidate.suggestedPriority,
      reasons: [...candidate.reasons],
      confidence: candidate.confidence,
    },
    evidence: candidate.evidence.map(({ sourceType, sourceId }) => ({
      sourceType,
      sourceId,
    })),
    duplicateTaskId: candidate.duplicateTaskId,
  };
}

function toNullableDateTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
