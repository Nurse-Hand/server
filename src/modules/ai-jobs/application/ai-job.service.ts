import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { AiJobClaimLostError } from '../domain/ai-job.errors';
import {
  assertClaimAiJobInput,
  assertFailureCode,
  assertFinishAiJobInput,
  assertResultReference,
  assertRetryable,
} from './ai-job-validation';
import {
  AI_JOB_REPOSITORY,
  type AiJobClaim,
  type AiJobRepository,
} from './ports/ai-job.repository';

@Injectable()
export class AiJobService {
  constructor(
    @Inject(AI_JOB_REPOSITORY)
    private readonly repository: AiJobRepository,
    private readonly clock: Clock,
  ) {}

  claimNext(input: {
    datasetId: string;
    wardId: string;
    operation: string;
    leaseMilliseconds: number;
  }): Promise<AiJobClaim | null> {
    assertClaimAiJobInput(input);

    const claimedAt = this.clock.now();
    const leaseExpiresAt = new Date(
      claimedAt.getTime() + input.leaseMilliseconds,
    );

    return this.repository.claimNext({
      datasetId: input.datasetId,
      wardId: input.wardId,
      operation: input.operation,
      claimedAt,
      leaseExpiresAt,
    });
  }

  async complete(input: {
    datasetId: string;
    jobId: string;
    leaseVersion: number;
    resultReference: string;
  }): Promise<void> {
    assertFinishAiJobInput(input);
    assertResultReference(input.resultReference);
    const isCompleted = await this.repository.complete({
      ...input,
      now: this.clock.now(),
    });

    if (!isCompleted) {
      throw new AiJobClaimLostError();
    }
  }

  async fail(input: {
    datasetId: string;
    jobId: string;
    leaseVersion: number;
    failureCode: string;
    retryable: boolean;
  }): Promise<void> {
    assertFinishAiJobInput(input);
    assertFailureCode(input.failureCode);
    assertRetryable(input.retryable);

    const isFailed = await this.repository.fail({
      ...input,
      now: this.clock.now(),
    });

    if (!isFailed) {
      throw new AiJobClaimLostError();
    }
  }
}
