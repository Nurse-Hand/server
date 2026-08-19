import type {
  ListTasksResult,
  TaskView,
} from '../application/ports/task.repository';
import type {
  TaskAiSuggestionDto,
  TaskDataDto,
  TaskListDataDto,
} from './task-response.dto';

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

function toNullableDateTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
