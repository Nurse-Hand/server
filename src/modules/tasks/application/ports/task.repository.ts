import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type {
  TaskAiConfidence,
  TaskListSort,
  TaskPriority,
  TaskSource,
  TaskStatus,
} from '../../domain/task.types';

export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

export type TaskView = {
  id: string;
  patientId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  workDate: Date;
  status: TaskStatus;
  source: TaskSource;
  aiSuggestedPriority: TaskPriority | null;
  aiReasons: readonly string[];
  aiConfidence: TaskAiConfidence | null;
  rulePriority: TaskPriority;
  confirmedPriority: TaskPriority | null;
  effectivePriority: TaskPriority;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ListTasksInput = {
  context: DemoSessionContext;
  workDate: Date;
  date: string;
  status?: TaskStatus;
  patientId?: string;
  sort: TaskListSort;
  cursor?: string;
  limit: number;
  now: Date;
};

export type ListTasksResult = {
  items: readonly TaskView[];
  nextCursor: string | null;
};

export type CreateTaskInput = {
  context: DemoSessionContext;
  idempotencyKey: string;
  requestHash: string;
  patientId: string | null;
  title: string;
  description: string | null;
  dueAt: Date;
  workDate: Date;
  confirmedPriority: TaskPriority | null;
  now: Date;
};

export type CreateTaskResult = {
  task: TaskView;
  isReplay: boolean;
};

export type UpdateTaskInput = {
  context: DemoSessionContext;
  taskId: string;
  expectedVersion: number;
  title?: string;
  description?: string | null;
  dueAt?: Date;
  workDate?: Date;
  status?: TaskStatus;
  confirmedPriority?: TaskPriority | null;
  now: Date;
};

export interface TaskRepository {
  list(input: ListTasksInput): Promise<ListTasksResult>;
  create(input: CreateTaskInput): Promise<CreateTaskResult>;
  update(input: UpdateTaskInput): Promise<TaskView>;
}
