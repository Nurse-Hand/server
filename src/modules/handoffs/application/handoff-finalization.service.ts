import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import type { HandoffUnverifiedHandling } from '../domain/handoff.constants';
import { HandoffCommandInvalidError } from '../domain/handoff.errors';
import type {
  FinalizedHandoff,
  HandoffFinalizationContext,
} from './handoff-finalization.models';
import {
  HANDOFF_FINALIZATION_REPOSITORY,
  type HandoffFinalizationRepository,
} from './ports/handoff-finalization.repository';

type FinalizeHandoffRequest = {
  version: number;
  unverifiedHandling: HandoffUnverifiedHandling;
};

@Injectable()
export class HandoffFinalizationService {
  constructor(
    @Inject(HANDOFF_FINALIZATION_REPOSITORY)
    private readonly repository: HandoffFinalizationRepository,
    private readonly clock: Clock,
  ) {}

  finalize(
    context: HandoffFinalizationContext,
    handoffId: string,
    body: FinalizeHandoffRequest,
    idempotencyKey: string,
    requestId: string,
  ): Promise<FinalizedHandoff> {
    assertIdempotencyKey(idempotencyKey);
    const requestHash = createCanonicalRequestHash({
      path: { handoffId },
      query: {},
      body: {
        unverifiedHandling: body.unverifiedHandling,
        version: body.version,
      },
    });

    return this.repository.finalize({
      context,
      handoffId,
      version: body.version,
      unverifiedHandling: body.unverifiedHandling,
      idempotencyKey,
      requestHash,
      requestId,
      now: this.clock.now(),
    });
  }
}

function assertIdempotencyKey(value: string): void {
  if (value.length < 1 || value.length > 128) {
    throw new HandoffCommandInvalidError();
  }
}
