import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { TaskReadModel } from '../../tasks/application/ports/task-query.port';
import type {
  HandoffClinicalSection,
  HandoffPrecheckAnswer,
  HandoffPrecheckSeverity,
  HandoffRootStatus,
  HandoffTemplateId,
} from '../domain/handoff.constants';
import type {
  HandoffPrecheckEvidence,
  HandoffPrecheckSourceSnapshot,
} from './handoff-precheck.models';

export type HandoffDraftContext = DemoSessionContext;

export type HandoffGenerationJob = {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  failureCode: string | null;
  retryable: boolean | null;
};

export type FrozenHandoffPrecheckItem = {
  itemId: string;
  patientId: string;
  severity: HandoffPrecheckSeverity;
  question: string;
  reason: string;
  evidence: readonly HandoffPrecheckEvidence[];
  answer: HandoffPrecheckAnswer | null;
  comment: string | null;
  version: number;
};

export type HandoffDraftSection = {
  section: HandoffClinicalSection;
  aiOriginalContent: string;
  currentContent: string;
  isModified: boolean;
  citations: readonly HandoffPrecheckEvidence[];
};

export type HandoffPatientDraft = {
  patientId: string;
  sections: readonly HandoffDraftSection[];
};

export type HandoffLinkedTask = TaskReadModel;

export type HandoffDraftWarning = {
  itemId: string;
  patientId: string;
  severity: HandoffPrecheckSeverity;
  answer: HandoffPrecheckAnswer | null;
  question: string;
  isIncludedInAiInput: boolean;
};

export type HandoffDraftContent = {
  templateId: HandoffTemplateId;
  includeUnverified: boolean;
  patients: readonly HandoffPatientDraft[];
  tasks: readonly HandoffLinkedTask[];
  warnings: readonly HandoffDraftWarning[];
};

export type HandoffDraftDetail = {
  handoffId: string;
  status: HandoffRootStatus;
  version: number;
  date: string;
  senderActorId: string;
  receiverActorId: string;
  generationJob: HandoffGenerationJob;
  draft: HandoffDraftContent | null;
  updatedAt: Date;
};

export type HandoffDraftListItem = {
  handoffId: string;
  status: 'DRAFT' | 'FINALIZED';
  patientCount: number;
  taskCount: number;
  updatedAt: Date;
};

export type HandoffDraftListResult = {
  items: readonly HandoffDraftListItem[];
  nextCursor: string | null;
};

export type CreateHandoffDraftCommand = {
  context: HandoffDraftContext;
  precheckId: string;
  templateId: HandoffTemplateId;
  includeUnverified: boolean;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  now: Date;
  maxAttempts: number;
};

export type UpdateHandoffDraftCommand = {
  context: HandoffDraftContext;
  handoffId: string;
  version: number;
  patients: readonly {
    patientId: string;
    sections: Readonly<Record<HandoffClinicalSection, string>>;
  }[];
  tasks: readonly HandoffLinkedTask[];
  now: Date;
};

export type HandoffDraftFrozenWork = {
  handoffId: string;
  templateId: 'NURSING_HANDOFF_V1';
  includeUnverified: boolean;
  snapshot: HandoffPrecheckSourceSnapshot;
  precheckItems: readonly FrozenHandoffPrecheckItem[];
};
