import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type {
  TaskAiConfidence,
  TaskEvidenceSourceType,
  TaskListSort,
  TaskPriority,
  TaskPrioritySignalLevel,
  TaskScopeType,
  TaskSource,
  TaskStatus,
} from '../../domain/task.types';
import type { TaskExtractionEvidenceSnapshot } from './task-extraction-evidence.port';

export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

export type TaskView = {
  id: string;
  scopeType: TaskScopeType;
  patientId: string | null;
  locationLabel: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  workDate: Date;
  status: TaskStatus;
  source: TaskSource;
  isCarryOver: boolean;
  dependencyTaskIds: readonly string[];
  priorityMeta: TaskPriorityMeta;
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

export type TaskPriorityMeta = {
  patientStatusUrgency: TaskPrioritySignalLevel | null;
  timeSensitivity: TaskPrioritySignalLevel | null;
  taskCriticality: TaskPrioritySignalLevel | null;
  isBlocking: boolean;
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
  scopeType: TaskScopeType;
  patientId: string | null;
  locationLabel: string | null;
  title: string;
  description: string | null;
  dueAt: Date;
  workDate: Date;
  isCarryOver: boolean;
  dependencyTaskIds: readonly string[];
  priorityMeta: TaskPriorityMeta;
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
  scopeType?: TaskScopeType;
  patientId?: string | null;
  locationLabel?: string | null;
  isCarryOver?: boolean;
  dependencyTaskIds?: readonly string[];
  priorityMeta?: TaskPriorityMeta;
  confirmedPriority?: TaskPriority | null;
  prioritySuggestionId?: string;
  now: Date;
};

export type ReserveTaskExtractionInput = {
  context: DemoSessionContext;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  maxAttempts: number;
  evidenceSnapshot: TaskExtractionEvidenceSnapshot;
  now: Date;
};

export type ReserveTaskExtractionResult = {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  isReplay: boolean;
};

export type TaskExtractionWorkItem = {
  jobId: string;
  datasetId: string;
  actorId: string;
  wardId: string;
  requestId: string;
  evidence: readonly {
    id: string;
    recordId: string;
    sourceType: TaskEvidenceSourceType;
    sourceId: string;
    patientId: string | null;
    workDate: Date;
    summary: string;
  }[];
};

export type CompleteTaskExtractionCandidate = {
  candidateKey: string;
  patientId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  workDate: Date;
  suggestedPriority: TaskPriority;
  reasons: readonly string[];
  confidence: TaskAiConfidence;
  evidenceSourceIds: readonly string[];
};

export type CompleteTaskExtractionInput = {
  claim: {
    jobId: string;
    datasetId: string;
    actorId: string;
    wardId: string;
    leaseVersion: number;
  };
  candidates: readonly CompleteTaskExtractionCandidate[];
  now: Date;
};

export type TaskExtractionCandidateView = {
  id: string;
  patientId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  workDate: Date;
  suggestedPriority: TaskPriority;
  reasons: readonly string[];
  confidence: TaskAiConfidence;
  evidence: readonly {
    sourceType: TaskEvidenceSourceType;
    sourceId: string;
  }[];
  duplicateTaskId: string | null;
  appliedTaskId: string | null;
};

export type ApplyTaskCandidateItem = {
  candidateId: string;
  title?: string;
  dueAt?: Date | null;
  priorityOverride?: TaskPriority | null;
};

export type ApplyTaskCandidatesInput = {
  context: DemoSessionContext;
  jobId: string;
  idempotencyKey: string;
  requestHash: string;
  items: readonly ApplyTaskCandidateItem[];
  now: Date;
};

export type ApplyTaskCandidatesResult = {
  createdTaskIds: readonly string[];
  skippedCandidateIds: readonly string[];
  isReplay: boolean;
};

export type TaskExtractionJobView = {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  failureCode: string | null;
  retryable: boolean | null;
  candidates: readonly TaskExtractionCandidateView[];
  createdAt: Date;
  updatedAt: Date;
};

export interface TaskRepository {
  list(input: ListTasksInput): Promise<ListTasksResult>;
  create(input: CreateTaskInput): Promise<CreateTaskResult>;
  update(input: UpdateTaskInput): Promise<TaskView>;
  findExtractionReservationReplay(input: {
    context: DemoSessionContext;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<ReserveTaskExtractionResult | null>;
  reserveExtraction(
    input: ReserveTaskExtractionInput,
  ): Promise<ReserveTaskExtractionResult>;
  findExtractionWorkItem(
    datasetId: string,
    jobId: string,
  ): Promise<TaskExtractionWorkItem>;
  completeExtraction(input: CompleteTaskExtractionInput): Promise<void>;
  findExtractionJob(
    context: DemoSessionContext,
    jobId: string,
  ): Promise<TaskExtractionJobView>;
  applyCandidates(
    input: ApplyTaskCandidatesInput,
  ): Promise<ApplyTaskCandidatesResult>;
}
