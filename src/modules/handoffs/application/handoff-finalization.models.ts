import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  HandoffClinicalSection,
  HandoffPrecheckAnswer,
  HandoffPrecheckSeverity,
  HandoffUnverifiedHandling,
} from '../domain/handoff.constants';
import type { HandoffPrecheckEvidence } from './handoff-precheck.models';

export type HandoffFinalizationContext = DemoSessionContext;

export type FinalizeHandoffCommand = {
  context: HandoffFinalizationContext;
  handoffId: string;
  version: number;
  unverifiedHandling: HandoffUnverifiedHandling;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  now: Date;
};

export type FinalizedHandoff = {
  handoffId: string;
  status: 'FINALIZED';
  finalizedAt: Date;
  version: number;
};

export type HandoffFinalSnapshot = {
  snapshotVersion: 1;
  sourceDraftVersion: number;
  precheckVersion: number;
  templateId: 'NURSING_HANDOFF_V1';
  includeUnverified: boolean;
  unverifiedHandling: HandoffUnverifiedHandling;
  senderActorId: string;
  receiverActorId: string;
  patients: readonly {
    patientId: string;
    sections: readonly {
      section: HandoffClinicalSection;
      aiOriginalContent: string;
      currentContent: string;
      isModified: boolean;
      citations: readonly HandoffPrecheckEvidence[];
    }[];
  }[];
  tasks: readonly {
    taskId: string;
    patientId: string | null;
    title: string;
    dueAt: Date | null;
    effectivePriority: 'CRITICAL' | 'HIGH' | 'NORMAL';
    sourceVersion: number;
    sourceUpdatedAt: Date;
    sourceReferences: readonly string[];
  }[];
  precheckItems: readonly {
    itemId: string;
    patientId: string;
    severity: HandoffPrecheckSeverity;
    question: string;
    reason: string;
    evidence: readonly HandoffPrecheckEvidence[];
    answer: HandoffPrecheckAnswer | null;
    comment: string | null;
    answeredByActorId: string | null;
    answeredAt: Date | null;
    sourceItemVersion: number;
    sourceAnswerVersion: number | null;
  }[];
  warnings: readonly {
    itemId: string;
    patientId: string;
    severity: HandoffPrecheckSeverity;
    answer: HandoffPrecheckAnswer | null;
    question: string;
    warningType: 'UNVERIFIED' | 'UNANSWERED_RECOMMENDED';
    message: string;
    isIncludedInAiInput: boolean;
  }[];
  finalizedByActorId: string;
  finalizedAt: Date;
};
