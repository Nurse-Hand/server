import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import {
  TASK_QUERY_PORT,
  type TaskQueryPort,
} from '../../tasks/application/ports/task-query.port';
import {
  TIMELINE_READER,
  type TimelineReader,
} from '../../timeline/application/ports/timeline-reader';
import {
  HANDOFF_JOB_MAX_ATTEMPTS,
  type HandoffPrecheckAnswer,
  type HandoffTargetDuty,
} from '../domain/handoff.constants';
import { HandoffCommandInvalidError } from '../domain/handoff.errors';
import type {
  HandoffPrecheckContext,
  HandoffPrecheckDetail,
  HandoffPrecheckSourceSnapshot,
} from './handoff-precheck.models';
import {
  HANDOFF_PRECHECK_REPOSITORY,
  type HandoffPrecheckRepository,
} from './ports/handoff-precheck.repository';

type CreatePrecheckRequest = {
  shiftId: string;
  targetDuty: HandoffTargetDuty;
  date: string;
};

type AnswerPrecheckItemRequest = {
  answer: HandoffPrecheckAnswer;
  comment?: string | null;
  version: number;
};

@Injectable()
export class HandoffPrechecksService {
  constructor(
    @Inject(HANDOFF_PRECHECK_REPOSITORY)
    private readonly repository: HandoffPrecheckRepository,
    @Inject(TIMELINE_READER)
    private readonly timelineReader: TimelineReader,
    @Inject(TASK_QUERY_PORT)
    private readonly taskQueryPort: TaskQueryPort,
    private readonly clock: Clock,
  ) {}

  async create(
    context: HandoffPrecheckContext,
    body: CreatePrecheckRequest,
    idempotencyKey: string,
    requestId: string,
  ): Promise<{ precheckId: string; status: 'QUEUED' }> {
    assertIdempotencyKey(idempotencyKey);
    const requestHash = createCanonicalRequestHash({
      path: {},
      query: {},
      body: {
        date: body.date,
        shiftId: body.shiftId,
        targetDuty: body.targetDuty,
      },
    });
    const replay = await this.repository.findReplay({
      context,
      idempotencyKey,
      requestHash,
    });
    if (replay !== null) {
      return { precheckId: replay.resourceId, status: 'QUEUED' };
    }

    const now = this.clock.now();
    const scope = await this.repository.resolveShiftScope({
      context,
      shiftId: body.shiftId,
      targetDuty: body.targetDuty,
      date: body.date,
      now,
    });
    const [timelineEvents, tasks] = await Promise.all([
      this.timelineReader.readMany({
        context,
        patientIds: scope.patientIds,
      }),
      this.taskQueryPort.findIncompleteByPatients(context, scope.patientIds),
    ]);
    const snapshot: HandoffPrecheckSourceSnapshot = {
      capturedAt: now,
      patients: scope.patientIds.map((patientId) => ({
        patientId,
        timelineEvents: timelineEvents.filter(
          (event) => event.patientId === patientId,
        ),
      })),
      tasks,
    };
    const reserved = await this.repository.reserve({
      context,
      ...body,
      idempotencyKey,
      requestHash,
      requestId,
      now,
      scope,
      snapshot,
      maxAttempts: HANDOFF_JOB_MAX_ATTEMPTS,
    });

    return { precheckId: reserved.resourceId, status: 'QUEUED' };
  }

  get(
    context: HandoffPrecheckContext,
    precheckId: string,
  ): Promise<HandoffPrecheckDetail> {
    return this.repository.get(context, precheckId);
  }

  answerItem(
    context: HandoffPrecheckContext,
    precheckId: string,
    itemId: string,
    body: AnswerPrecheckItemRequest,
  ) {
    return this.repository.answerItem({
      context,
      precheckId,
      itemId,
      answer: body.answer,
      comment: body.comment ?? null,
      version: body.version,
      now: this.clock.now(),
    });
  }
}

function assertIdempotencyKey(value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new HandoffCommandInvalidError();
  }
}
