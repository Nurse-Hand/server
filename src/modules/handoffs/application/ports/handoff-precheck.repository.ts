import type { AiJobClaim } from '../../../ai-jobs/application/ports/ai-job.repository';
import type { HandoffTargetDuty } from '../../domain/handoff.constants';
import type {
  CreateHandoffPrecheckCommand,
  HandoffPrecheckContext,
  HandoffPrecheckDetail,
  HandoffPrecheckItem,
  HandoffPrecheckSourceSnapshot,
  ResolvedHandoffPrecheckScope,
} from '../handoff-precheck.models';

export const HANDOFF_PRECHECK_REPOSITORY = Symbol(
  'HANDOFF_PRECHECK_REPOSITORY',
);

export type HandoffPrecheckReservation = {
  resourceId: string;
  jobId: string;
  isReplay: boolean;
};

export type HandoffPrecheckWork = {
  precheckId: string;
  snapshot: HandoffPrecheckSourceSnapshot;
};

export type PublishedHandoffPrecheckResult = {
  requestId: string;
  modelVersion: string;
  contractVersion: string;
  generatedAt: Date;
  items: readonly Omit<
    HandoffPrecheckItem,
    'itemId' | 'answer' | 'comment' | 'version'
  >[];
};

export interface HandoffPrecheckRepository {
  resolveShiftScope(input: {
    context: HandoffPrecheckContext;
    shiftId: string;
    targetDuty: HandoffTargetDuty;
    date: string;
    now: Date;
  }): Promise<ResolvedHandoffPrecheckScope>;

  findReplay(input: {
    context: HandoffPrecheckContext;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<HandoffPrecheckReservation | null>;

  reserve(
    input: CreateHandoffPrecheckCommand,
  ): Promise<HandoffPrecheckReservation>;

  get(
    context: HandoffPrecheckContext,
    precheckId: string,
  ): Promise<HandoffPrecheckDetail>;

  answerItem(input: {
    context: HandoffPrecheckContext;
    precheckId: string;
    itemId: string;
    answer: NonNullable<HandoffPrecheckItem['answer']>;
    comment: string | null;
    version: number;
    now: Date;
  }): Promise<Pick<HandoffPrecheckItem, 'itemId' | 'answer' | 'version'>>;

  getWork(claim: AiJobClaim): Promise<HandoffPrecheckWork>;

  publishResult(input: {
    claim: AiJobClaim;
    result: PublishedHandoffPrecheckResult;
    now: Date;
  }): Promise<void>;
}
