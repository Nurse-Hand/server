import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import type { HandoffAcknowledgementStatus } from '../domain/handoff.constants';
import { decodeHandoffHistoryCursor } from '../domain/handoff-history-cursor';
import { HandoffCommandInvalidError } from '../domain/handoff.errors';
import type {
  CreatedHandoffAcknowledgement,
  HandoffActivityContext,
  HandoffHistoryPage,
} from './handoff-activity.models';
import {
  HANDOFF_ACTIVITY_REPOSITORY,
  type HandoffActivityRepository,
} from './ports/handoff-activity.repository';

const DEFAULT_HISTORY_LIMIT = 20;

type CreateAcknowledgementRequest = {
  status: HandoffAcknowledgementStatus;
  comment?: string | null;
};

@Injectable()
export class HandoffActivityService {
  constructor(
    @Inject(HANDOFF_ACTIVITY_REPOSITORY)
    private readonly repository: HandoffActivityRepository,
    private readonly clock: Clock,
  ) {}

  acknowledge(
    context: HandoffActivityContext,
    handoffId: string,
    body: CreateAcknowledgementRequest,
    idempotencyKey: string,
    requestId: string,
  ): Promise<CreatedHandoffAcknowledgement> {
    assertIdempotencyKey(idempotencyKey);
    const comment = body.comment ?? null;
    const requestHash = createCanonicalRequestHash({
      path: { handoffId },
      query: {},
      body: { comment, status: body.status },
    });
    return this.repository.acknowledge({
      context,
      handoffId,
      status: body.status,
      comment,
      idempotencyKey,
      requestHash,
      requestId,
      now: this.clock.now(),
    });
  }

  history(
    context: HandoffActivityContext,
    handoffId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<HandoffHistoryPage> {
    return this.repository.history({
      context,
      handoffId,
      ...(query.cursor === undefined
        ? {}
        : { cursor: decodeHandoffHistoryCursor(query.cursor) }),
      limit: query.limit ?? DEFAULT_HISTORY_LIMIT,
      viewedAt: this.clock.now(),
    });
  }
}

function assertIdempotencyKey(value: string): void {
  if (value.length < 1 || value.length > 128) {
    throw new HandoffCommandInvalidError();
  }
}
