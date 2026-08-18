import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
  IdempotencyRequestInProgressError,
} from './idempotency.errors';

export type IdempotencyRecordSnapshot = {
  wardId: string;
  requestHash: string;
  status: 'PROCESSING' | 'COMPLETED';
  resultReference: string | null;
};

export function resolveCompletedIdempotencyRecord(
  expected: { wardId: string; requestHash: string },
  record: IdempotencyRecordSnapshot,
): string {
  if (
    record.wardId !== expected.wardId ||
    record.requestHash !== expected.requestHash
  ) {
    throw new IdempotencyKeyReusedError();
  }

  if (record.status === 'PROCESSING') {
    throw new IdempotencyRequestInProgressError();
  }

  if (record.resultReference === null) {
    throw new IdempotencyInvariantViolationError();
  }

  return record.resultReference;
}
