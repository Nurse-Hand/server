import type { AiJobClaim } from '../../../ai-jobs/application/ports/ai-job.repository';
import type {
  CreateHandoffDraftCommand,
  HandoffDraftContext,
  HandoffDraftDetail,
  HandoffDraftFrozenWork,
  HandoffDraftListResult,
  HandoffDraftWarning,
  HandoffPatientDraft,
  UpdateHandoffDraftCommand,
} from '../handoff-draft.models';

export const HANDOFF_DRAFT_REPOSITORY = Symbol('HANDOFF_DRAFT_REPOSITORY');

export type HandoffDraftReservation = {
  resourceId: string;
  jobId: string;
  isReplay: boolean;
};

export type PublishedHandoffDraftResult = {
  requestId: string;
  modelVersion: string;
  contractVersion: string;
  generatedAt: Date;
  patients: readonly HandoffPatientDraft[];
  warnings: readonly Omit<HandoffDraftWarning, 'isIncludedInAiInput'>[];
};

export interface HandoffDraftRepository {
  findReplay(input: {
    context: HandoffDraftContext;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<HandoffDraftReservation | null>;

  reserve(input: CreateHandoffDraftCommand): Promise<HandoffDraftReservation>;

  list(input: {
    context: HandoffDraftContext;
    date?: string;
    status?: 'DRAFT' | 'FINALIZED';
    cursor?: { updatedAt: Date; id: string };
    limit: number;
  }): Promise<HandoffDraftListResult>;

  get(
    context: HandoffDraftContext,
    handoffId: string,
  ): Promise<HandoffDraftDetail>;

  update(input: UpdateHandoffDraftCommand): Promise<{
    handoffId: string;
    status: 'DRAFT';
    version: number;
    updatedAt: Date;
  }>;

  getWork(claim: AiJobClaim): Promise<HandoffDraftFrozenWork>;

  publishResult(input: {
    claim: AiJobClaim;
    result: PublishedHandoffDraftResult;
    now: Date;
  }): Promise<void>;
}
