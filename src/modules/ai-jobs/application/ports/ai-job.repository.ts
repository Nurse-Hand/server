export const AI_JOB_REPOSITORY = Symbol('AI_JOB_REPOSITORY');

export type AiJobScope = {
  datasetId: string;
  actorId: string;
  wardId: string;
};

export type ReserveAiJobInput = AiJobScope & {
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  maxAttempts: number;
};

export type AiJobReservationResult =
  | { kind: 'CREATED'; jobId: string }
  | {
      kind: 'EXISTING';
      jobId: string | null;
      wardId: string;
      requestHash: string;
      status: 'PROCESSING' | 'COMPLETED';
      resultReference: string | null;
    };

export type ClaimAiJobInput = {
  datasetId: string;
  wardId: string;
  operation: string;
  claimedAt: Date;
  leaseExpiresAt: Date;
};

export type AiJobClaim = {
  jobId: string;
  datasetId: string;
  actorId: string;
  wardId: string;
  operation: string;
  requestId: string;
  attempt: number;
  maxAttempts: number;
  leaseVersion: number;
  claimedAt: Date;
  leaseExpiresAt: Date;
};

export type FinishAiJobInput = {
  datasetId: string;
  jobId: string;
  leaseVersion: number;
  now: Date;
};

export interface AiJobRepository {
  reserve(input: ReserveAiJobInput): Promise<AiJobReservationResult>;
  claimNext(input: ClaimAiJobInput): Promise<AiJobClaim | null>;
  complete(
    input: FinishAiJobInput & { resultReference: string },
  ): Promise<boolean>;
  fail(
    input: FinishAiJobInput & { failureCode: string; retryable: boolean },
  ): Promise<boolean>;
}
