import { isUUID } from 'class-validator';
import { AiJobCommandInvalidError } from '../domain/ai-job.errors';
import type { ReserveAiJobInput } from './ports/ai-job.repository';

const MAX_ATTEMPTS = 10;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function assertReserveAiJobInput(input: ReserveAiJobInput): void {
  assertUuid(input.datasetId);
  assertUuid(input.actorId);
  assertUuid(input.wardId);
  assertUuid(input.requestId);
  assertOperation(input.operation);

  if (
    typeof input.idempotencyKey !== 'string' ||
    !/^[\x21-\x7e]{1,128}$/.test(input.idempotencyKey)
  ) {
    throw new AiJobCommandInvalidError();
  }

  if (
    typeof input.requestHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.requestHash)
  ) {
    throw new AiJobCommandInvalidError();
  }

  if (
    !Number.isInteger(input.maxAttempts) ||
    input.maxAttempts < 1 ||
    input.maxAttempts > MAX_ATTEMPTS
  ) {
    throw new AiJobCommandInvalidError();
  }
}

export function assertClaimAiJobInput(input: {
  datasetId: string;
  wardId: string;
  operation: string;
  leaseMilliseconds: number;
}): void {
  assertUuid(input.datasetId);
  assertUuid(input.wardId);
  assertOperation(input.operation);

  if (
    !Number.isInteger(input.leaseMilliseconds) ||
    input.leaseMilliseconds < 1 ||
    input.leaseMilliseconds > 60 * 60 * 1000
  ) {
    throw new AiJobCommandInvalidError();
  }
}

export function assertFinishAiJobInput(input: {
  datasetId: string;
  jobId: string;
  leaseVersion: number;
}): void {
  assertUuid(input.datasetId);
  assertUuid(input.jobId);

  if (
    !Number.isInteger(input.leaseVersion) ||
    input.leaseVersion < 1 ||
    input.leaseVersion > POSTGRES_INTEGER_MAX
  ) {
    throw new AiJobCommandInvalidError();
  }
}

export function assertResultReference(resultReference: string): void {
  if (
    typeof resultReference !== 'string' ||
    resultReference.length < 1 ||
    resultReference.length > 255 ||
    resultReference.trim() !== resultReference ||
    hasControlCharacter(resultReference)
  ) {
    throw new AiJobCommandInvalidError();
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);

    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export function assertFailureCode(failureCode: string): void {
  if (
    typeof failureCode !== 'string' ||
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(failureCode)
  ) {
    throw new AiJobCommandInvalidError();
  }
}

export function assertRetryable(retryable: boolean): void {
  if (typeof retryable !== 'boolean') {
    throw new AiJobCommandInvalidError();
  }
}

function assertOperation(operation: string): void {
  if (
    typeof operation !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(operation)
  ) {
    throw new AiJobCommandInvalidError();
  }
}

function assertUuid(value: string): void {
  if (typeof value !== 'string' || !isUUID(value)) {
    throw new AiJobCommandInvalidError();
  }
}
