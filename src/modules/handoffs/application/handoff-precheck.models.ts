import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { TaskReadModel } from '../../tasks/application/ports/task-query.port';
import type { TimelineEventReadModel } from '../../timeline/application/ports/timeline-reader';
import type {
  HandoffPrecheckAnswer,
  HandoffPrecheckSeverity,
  HandoffSourceType,
  HandoffTargetDuty,
} from '../domain/handoff.constants';

export type HandoffPrecheckContext = DemoSessionContext;

export type HandoffEvidenceExcerptKind = 'UTTERANCE' | 'SUMMARY' | 'TASK_TITLE';

export type HandoffPrecheckEvidence = {
  sourceType: HandoffSourceType;
  sourceId: string;
  sourceReference: string;
  occurredAt: Date | null;
  excerptKind: HandoffEvidenceExcerptKind;
  excerpt: string;
};

export type HandoffPrecheckItem = {
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

export type HandoffPrecheckDetail = {
  precheckId: string;
  version: number;
  job: {
    jobId: string;
    status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
    failureCode: string | null;
    retryable: boolean | null;
  };
  modelVersion: string | null;
  contractVersion: string | null;
  generatedAt: Date | null;
  items: readonly HandoffPrecheckItem[];
};

export type ResolvedHandoffPrecheckScope = {
  senderShiftId: string;
  senderStartsAt: Date;
  senderEndsAt: Date;
  receiverShiftId: string;
  receiverActorId: string;
  receiverStartsAt: Date;
  patientIds: readonly string[];
};

export type HandoffPrecheckSourceSnapshot = {
  capturedAt: Date;
  patients: readonly {
    patientId: string;
    timelineEvents: readonly TimelineEventReadModel[];
  }[];
  tasks: readonly TaskReadModel[];
};

export type CreateHandoffPrecheckCommand = {
  context: HandoffPrecheckContext;
  shiftId: string;
  targetDuty: HandoffTargetDuty;
  date: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  now: Date;
  scope: ResolvedHandoffPrecheckScope;
  snapshot: HandoffPrecheckSourceSnapshot;
  maxAttempts: number;
};
