import type {
  TaskListSort,
  TaskPriority,
  TaskPriorityAiPriority,
} from './task.types';

const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
};

export function calculateTaskRulePriority(input: {
  dueAt: Date | null;
  now: Date;
  currentDutyEndsAt: Date;
}): TaskPriority {
  if (input.dueAt === null) {
    return 'NORMAL';
  }

  if (input.dueAt.getTime() < input.now.getTime()) {
    return 'CRITICAL';
  }

  if (input.dueAt.getTime() <= input.currentDutyEndsAt.getTime()) {
    return 'HIGH';
  }

  return 'NORMAL';
}

export function getEffectiveTaskPriority(
  rulePriority: TaskPriority,
  confirmedPriority: TaskPriority | null,
): TaskPriority {
  return confirmedPriority ?? rulePriority;
}

export type TaskOrderingValue = {
  id: string;
  dueAt: Date | null;
  createdAt: Date;
  effectivePriority: TaskPriority;
};

export type TaskPrioritySuggestionOrderingValue = {
  taskId: string;
  aiScore: number;
};

export function mapAiTaskPriority(
  priority: TaskPriorityAiPriority,
): TaskPriority {
  return priority;
}

export function compareTaskPrioritySuggestions(
  left: TaskPrioritySuggestionOrderingValue,
  right: TaskPrioritySuggestionOrderingValue,
): number {
  const scoreDifference = right.aiScore - left.aiScore;
  return scoreDifference === 0
    ? left.taskId.localeCompare(right.taskId)
    : scoreDifference;
}

export function compareTaskOrdering(
  left: TaskOrderingValue,
  right: TaskOrderingValue,
  sort: TaskListSort = 'priority',
): number {
  if (sort === 'priority') {
    const priorityDifference =
      PRIORITY_RANK[left.effectivePriority] -
      PRIORITY_RANK[right.effectivePriority];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }
  }

  const dueAtDifference = compareNullableDate(left.dueAt, right.dueAt);

  if (dueAtDifference !== 0) {
    return dueAtDifference;
  }

  if (sort === 'dueAt') {
    const priorityDifference =
      PRIORITY_RANK[left.effectivePriority] -
      PRIORITY_RANK[right.effectivePriority];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }
  }

  const createdAtDifference =
    left.createdAt.getTime() - right.createdAt.getTime();

  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.id.localeCompare(right.id);
}

function compareNullableDate(left: Date | null, right: Date | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left.getTime() - right.getTime();
}
