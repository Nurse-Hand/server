import { Inject, Injectable } from '@nestjs/common';
import { resolveCompletedIdempotencyRecord } from '../../../common/idempotency/idempotency-policy';
import { AiJobInvariantViolationError } from '../domain/ai-job.errors';
import { assertReserveAiJobInput } from './ai-job-validation';
import {
  AI_JOB_REPOSITORY,
  type AiJobRepository,
  type ReserveAiJobInput,
} from './ports/ai-job.repository';

export type ReservedAiJob = {
  jobId: string;
  isReplay: boolean;
};

@Injectable()
export class IdempotentAiJobService {
  constructor(
    @Inject(AI_JOB_REPOSITORY)
    private readonly repository: AiJobRepository,
  ) {}

  async reserve(input: ReserveAiJobInput): Promise<ReservedAiJob> {
    assertReserveAiJobInput(input);
    const reservation = await this.repository.reserve(input);

    if (reservation.kind === 'CREATED') {
      return { jobId: reservation.jobId, isReplay: false };
    }

    const resultReference = resolveCompletedIdempotencyRecord(
      { wardId: input.wardId, requestHash: input.requestHash },
      reservation,
    );

    if (reservation.jobId === null || resultReference !== reservation.jobId) {
      throw new AiJobInvariantViolationError();
    }

    return {
      jobId: reservation.jobId,
      isReplay: true,
    };
  }
}
