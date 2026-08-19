import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
} from '../../../common/idempotency/idempotency.errors';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { AiJobClaim } from '../../ai-jobs/application/ports/ai-job.repository';
import type {
  HandoffPrecheckContext,
  HandoffPrecheckDetail,
  HandoffPrecheckEvidence,
  HandoffPrecheckItem,
  HandoffPrecheckSourceSnapshot,
} from '../application/handoff-precheck.models';
import type {
  HandoffPrecheckRepository,
  HandoffPrecheckReservation,
  HandoffPrecheckWork,
  PublishedHandoffPrecheckResult,
} from '../application/ports/handoff-precheck.repository';
import { HANDOFF_JOB_OPERATIONS } from '../domain/handoff.constants';
import {
  HandoffAiResultInvalidError,
  HandoffJobClaimLostError,
  HandoffPrecheckLockedError,
  HandoffPrecheckNotFoundError,
  HandoffReceiverAmbiguousError,
  HandoffReceiverNotFoundError,
  HandoffShiftNotFoundError,
} from '../domain/handoff.errors';
import { seoulDateRange } from '../domain/seoul-work-date';

const precheckSnapshotInclude = {
  patientInputs: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
  timelineInputs: {
    orderBy: [
      { occurredAt: 'desc' as const },
      { timelineEventId: 'desc' as const },
    ],
  },
  taskInputs: {
    orderBy: [{ taskId: 'asc' as const }],
    include: {
      sourceReferences: { orderBy: [{ reference: 'asc' as const }] },
    },
  },
} satisfies Prisma.HandoffPrecheckInclude;

const precheckDetailInclude = {
  items: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: {
      answer: true,
      evidence: {
        orderBy: [{ id: 'asc' as const }],
        include: {
          timelineInput: true,
          taskInput: {
            include: {
              sourceReferences: {
                orderBy: [{ reference: 'asc' as const }],
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.HandoffPrecheckInclude;

@Injectable()
export class PrismaHandoffPrecheckRepository implements HandoffPrecheckRepository {
  constructor(private readonly prisma: PrismaService) {}

  async resolveShiftScope(
    input: Parameters<HandoffPrecheckRepository['resolveShiftScope']>[0],
  ): ReturnType<HandoffPrecheckRepository['resolveShiftScope']> {
    const sender = await this.prisma.nurseShift.findFirst({
      where: {
        id: input.shiftId,
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        nurseId: input.context.actorId,
        membership: { role: 'SENDER' },
        startsAt: { lte: input.now },
        endsAt: { gt: input.now },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });
    if (!sender) throw new HandoffShiftNotFoundError();

    const range = seoulDateRange(input.date);
    const receivers = await this.prisma.nurseShift.findMany({
      where: {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        duty: input.targetDuty,
        nurseId: { not: input.context.actorId },
        membership: { role: 'RECEIVER' },
        startsAt: {
          gte: range.from,
          lt: range.to,
          gt: sender.startsAt,
        },
        endsAt: { gt: input.now },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 2,
      select: { id: true, nurseId: true, startsAt: true },
    });
    if (receivers.length === 0) throw new HandoffReceiverNotFoundError();
    if (receivers.length > 1) throw new HandoffReceiverAmbiguousError();

    const receiver = receivers[0]!;
    const assignments = await this.prisma.patientAssignment.findMany({
      where: {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        nurseId: input.context.actorId,
        nurseShiftId: sender.id,
        startsAt: { lte: input.now },
        OR: [{ endsAt: null }, { endsAt: { gte: input.now } }],
      },
      orderBy: [{ patientId: 'asc' }, { id: 'asc' }],
      select: { patientId: true },
    });

    return {
      senderShiftId: sender.id,
      senderStartsAt: sender.startsAt,
      senderEndsAt: sender.endsAt,
      receiverShiftId: receiver.id,
      receiverActorId: receiver.nurseId,
      receiverStartsAt: receiver.startsAt,
      patientIds: [...new Set(assignments.map(({ patientId }) => patientId))],
    };
  }

  async findReplay(
    input: Parameters<HandoffPrecheckRepository['findReplay']>[0],
  ): Promise<HandoffPrecheckReservation | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          operation: HANDOFF_JOB_OPERATIONS.PRECHECK,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        wardId: true,
        requestHash: true,
        aiJob: { select: { id: true } },
      },
    });
    if (!record) return null;
    assertReplayMatches(input.context.wardId, input.requestHash, record);
    const jobId = record.aiJob?.id;
    if (!jobId) throw new IdempotencyInvariantViolationError();
    const precheck = await this.prisma.handoffPrecheck.findFirst({
      where: { datasetId: input.context.datasetId, aiJobId: jobId },
      select: { id: true },
    });
    if (!precheck) throw new IdempotencyInvariantViolationError();
    return { resourceId: precheck.id, jobId, isReplay: true };
  }

  async reserve(
    input: Parameters<HandoffPrecheckRepository['reserve']>[0],
  ): Promise<HandoffPrecheckReservation> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.idempotencyRecord.create({
          data: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: HANDOFF_JOB_OPERATIONS.PRECHECK,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          },
          select: { id: true },
        });
        const job = await transaction.aiJob.create({
          data: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: HANDOFF_JOB_OPERATIONS.PRECHECK,
            idempotencyRecordId: record.id,
            requestId: input.requestId,
            maxAttempts: input.maxAttempts,
          },
          select: { id: true },
        });
        const precheck = await transaction.handoffPrecheck.create({
          data: {
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
            senderActorId: input.context.actorId,
            receiverActorId: input.scope.receiverActorId,
            senderShiftId: input.scope.senderShiftId,
            receiverShiftId: input.scope.receiverShiftId,
            handoffDate: asDatabaseDate(input.date),
            targetDuty: input.targetDuty,
            aiJobId: job.id,
            idempotencyRecordId: record.id,
            requestHash: input.requestHash,
            requestId: input.requestId,
            createdAt: input.now,
            updatedAt: input.now,
          },
          select: { id: true },
        });
        await persistSnapshot(
          transaction,
          input.context.datasetId,
          precheck.id,
          input.snapshot,
        );
        return { resourceId: precheck.id, jobId: job.id, isReplay: false };
      });
    } catch (error: unknown) {
      if (!hasPrismaErrorCode(error, 'P2002')) throw error;
      const replay = await this.findReplay(input);
      if (!replay) throw error;
      return replay;
    }
  }

  async get(
    context: HandoffPrecheckContext,
    precheckId: string,
  ): Promise<HandoffPrecheckDetail> {
    const precheck = await this.prisma.handoffPrecheck.findFirst({
      where: {
        id: precheckId,
        datasetId: context.datasetId,
        wardId: context.wardId,
        senderActorId: context.actorId,
      },
      include: precheckDetailInclude,
    });
    if (!precheck) throw new HandoffPrecheckNotFoundError();
    const job = await this.prisma.aiJob.findFirst({
      where: {
        id: precheck.aiJobId,
        datasetId: context.datasetId,
        wardId: context.wardId,
        operation: HANDOFF_JOB_OPERATIONS.PRECHECK,
      },
      select: { id: true, status: true, failureCode: true, retryable: true },
    });
    if (!job) throw new IdempotencyInvariantViolationError();
    return mapDetail(precheck, job);
  }

  async answerItem(
    input: Parameters<HandoffPrecheckRepository['answerItem']>[0],
  ): ReturnType<HandoffPrecheckRepository['answerItem']> {
    return this.prisma.$transaction(async (transaction) => {
      const isLocked = await lockPrecheckRow(
        transaction,
        input.context,
        input.precheckId,
      );
      if (!isLocked) throw new HandoffPrecheckNotFoundError();
      const precheck = await transaction.handoffPrecheck.findFirst({
        where: {
          id: input.precheckId,
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          senderActorId: input.context.actorId,
        },
        select: { id: true, lockedAt: true, version: true },
      });
      if (!precheck) throw new HandoffPrecheckNotFoundError();
      if (precheck.lockedAt !== null) throw new HandoffPrecheckLockedError();

      const item = await transaction.handoffPrecheckItem.findFirst({
        where: {
          id: input.itemId,
          datasetId: input.context.datasetId,
          precheckId: input.precheckId,
        },
        select: { id: true, version: true, answer: { select: { id: true } } },
      });
      if (!item) throw new HandoffPrecheckNotFoundError();
      if (item.version !== input.version) {
        throw new VersionConflictError(input.version, item.version);
      }

      const nextVersion = input.version + 1;
      const updated = await transaction.handoffPrecheckItem.updateMany({
        where: {
          id: item.id,
          datasetId: input.context.datasetId,
          precheckId: input.precheckId,
          version: input.version,
        },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new VersionConflictError(input.version);

      if (item.answer) {
        await transaction.handoffPrecheckAnswer.update({
          where: { id: item.answer.id },
          data: {
            answerCode: input.answer,
            comment: input.comment,
            answeredByActorId: input.context.actorId,
            answeredAt: input.now,
            version: nextVersion,
            updatedAt: input.now,
          },
        });
      } else {
        await transaction.handoffPrecheckAnswer.create({
          data: {
            datasetId: input.context.datasetId,
            precheckId: input.precheckId,
            precheckItemId: item.id,
            answerCode: input.answer,
            comment: input.comment,
            answeredByActorId: input.context.actorId,
            answeredAt: input.now,
            version: nextVersion,
            createdAt: input.now,
            updatedAt: input.now,
          },
        });
      }

      const aggregate = await transaction.handoffPrecheck.updateMany({
        where: {
          id: precheck.id,
          datasetId: input.context.datasetId,
          lockedAt: null,
          version: precheck.version,
        },
        data: { version: { increment: 1 }, updatedAt: input.now },
      });
      if (aggregate.count !== 1) throw new HandoffPrecheckLockedError();
      return { itemId: item.id, answer: input.answer, version: nextVersion };
    });
  }

  async getWork(claim: AiJobClaim): Promise<HandoffPrecheckWork> {
    assertClaimOperation(claim);
    const precheck = await this.prisma.handoffPrecheck.findFirst({
      where: {
        aiJobId: claim.jobId,
        datasetId: claim.datasetId,
        wardId: claim.wardId,
        senderActorId: claim.actorId,
      },
      include: precheckSnapshotInclude,
    });
    if (!precheck) throw new HandoffJobClaimLostError();
    return { precheckId: precheck.id, snapshot: mapSnapshot(precheck) };
  }

  async publishResult(input: {
    claim: AiJobClaim;
    result: PublishedHandoffPrecheckResult;
    now: Date;
  }): Promise<void> {
    assertClaimOperation(input.claim);
    if (input.result.requestId !== input.claim.requestId) {
      throw new HandoffAiResultInvalidError();
    }
    await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.handoffPrecheck.findFirst({
        where: {
          aiJobId: input.claim.jobId,
          datasetId: input.claim.datasetId,
          wardId: input.claim.wardId,
          senderActorId: input.claim.actorId,
        },
        include: precheckSnapshotInclude,
      });
      await assertActiveClaim(transaction, input.claim, input.now);
      if (!target) throw new HandoffJobClaimLostError();

      const timelineById = new Map(
        target.timelineInputs.map((source) => [source.timelineEventId, source]),
      );
      const taskById = new Map(
        target.taskInputs.map((source) => [source.taskId, source]),
      );
      const itemRows: Prisma.HandoffPrecheckItemCreateManyInput[] = [];
      const evidenceRows: Prisma.HandoffPrecheckEvidenceCreateManyInput[] = [];

      input.result.items.forEach((item, position) => {
        const itemId = randomUUID();
        itemRows.push({
          id: itemId,
          datasetId: input.claim.datasetId,
          precheckId: target.id,
          position,
          severity: item.severity,
          aiQuestion: item.question,
          aiReason: item.reason,
          createdAt: input.now,
        });
        for (const evidence of item.evidence) {
          const timeline =
            evidence.sourceType === 'TIMELINE_EVENT'
              ? timelineById.get(evidence.sourceId)
              : undefined;
          const task =
            evidence.sourceType === 'TASK'
              ? taskById.get(evidence.sourceId)
              : undefined;
          if (
            (!timeline && !task) ||
            (timeline && timeline.patientId !== item.patientId) ||
            (task && task.patientId !== item.patientId)
          ) {
            throw new HandoffAiResultInvalidError();
          }
          evidenceRows.push({
            id: randomUUID(),
            datasetId: input.claim.datasetId,
            precheckId: target.id,
            precheckItemId: itemId,
            sourceType: evidence.sourceType,
            timelineInputId: timeline?.id ?? null,
            taskInputId: task?.id ?? null,
            createdAt: input.now,
          });
        }
      });

      if (itemRows.length > 0) {
        await transaction.handoffPrecheckItem.createMany({ data: itemRows });
      }
      if (evidenceRows.length > 0) {
        await transaction.handoffPrecheckEvidence.createMany({
          data: evidenceRows,
        });
      }
      await transaction.handoffPrecheck.update({
        where: { id: target.id },
        data: {
          aiModelVersion: input.result.modelVersion,
          aiContractVersion: input.result.contractVersion,
          aiGeneratedAt: input.result.generatedAt,
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });
      await finishClaimSuccess(
        transaction,
        input.claim,
        target.idempotencyRecordId,
        target.id,
        input.now,
      );
    });
  }
}

async function persistSnapshot(
  transaction: Prisma.TransactionClient,
  datasetId: string,
  precheckId: string,
  snapshot: HandoffPrecheckSourceSnapshot,
): Promise<void> {
  if (snapshot.patients.length > 0) {
    await transaction.handoffPrecheckPatientInput.createMany({
      data: snapshot.patients.map((patient, position) => ({
        id: randomUUID(),
        datasetId,
        precheckId,
        patientId: patient.patientId,
        position,
        createdAt: snapshot.capturedAt,
      })),
    });
  }
  const events = snapshot.patients.flatMap((patient) =>
    patient.timelineEvents.map((event) => ({
      patientId: patient.patientId,
      event,
    })),
  );
  if (events.length > 0) {
    await transaction.handoffPrecheckTimelineInput.createMany({
      data: events.map(({ patientId, event }) => ({
        id: randomUUID(),
        datasetId,
        precheckId,
        timelineEventId: event.id,
        patientId,
        occurredAt: event.occurredAt,
        eventType: event.type,
        eventSource: event.source,
        sourceReference: event.sourceReference,
        summary: event.summary,
        sourceVersion: event.version,
        capturedAt: snapshot.capturedAt,
        createdAt: snapshot.capturedAt,
      })),
    });
  }
  for (const task of snapshot.tasks) {
    const taskInputId = randomUUID();
    await transaction.handoffPrecheckTaskInput.create({
      data: {
        id: taskInputId,
        datasetId,
        precheckId,
        taskId: task.id,
        patientId: task.patientId,
        title: task.title,
        dueAt: task.dueAt,
        effectivePriority: task.effectivePriority,
        sourceVersion: task.version,
        sourceUpdatedAt: task.updatedAt,
        capturedAt: snapshot.capturedAt,
        createdAt: snapshot.capturedAt,
      },
    });
    if (task.sourceReferences.length > 0) {
      await transaction.handoffPrecheckTaskSourceReference.createMany({
        data: task.sourceReferences.map((reference) => ({
          id: randomUUID(),
          datasetId,
          precheckId,
          taskInputId,
          reference,
          createdAt: snapshot.capturedAt,
        })),
      });
    }
  }
}

type StoredSnapshot = Prisma.HandoffPrecheckGetPayload<{
  include: typeof precheckSnapshotInclude;
}>;

function mapSnapshot(precheck: StoredSnapshot): HandoffPrecheckSourceSnapshot {
  return {
    capturedAt:
      precheck.timelineInputs[0]?.capturedAt ??
      precheck.taskInputs[0]?.capturedAt ??
      precheck.createdAt,
    patients: precheck.patientInputs.map((patient) => ({
      patientId: patient.patientId,
      timelineEvents: precheck.timelineInputs
        .filter((event) => event.patientId === patient.patientId)
        .map((event) => ({
          id: event.timelineEventId,
          patientId: event.patientId,
          occurredAt: event.occurredAt,
          type: event.eventType,
          source: event.eventSource,
          summary: event.summary,
          version: event.sourceVersion,
          sourceReference: event.sourceReference,
        })),
    })),
    tasks: precheck.taskInputs.map((task) => ({
      id: task.taskId,
      patientId: task.patientId,
      title: task.title,
      dueAt: task.dueAt,
      effectivePriority: task.effectivePriority,
      version: task.sourceVersion,
      sourceReferences: task.sourceReferences.map(({ reference }) => reference),
      updatedAt: task.sourceUpdatedAt,
    })),
  };
}

function mapDetail(
  precheck: Prisma.HandoffPrecheckGetPayload<{
    include: typeof precheckDetailInclude;
  }>,
  job: {
    id: string;
    status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
    failureCode: string | null;
    retryable: boolean | null;
  },
): HandoffPrecheckDetail {
  return {
    precheckId: precheck.id,
    version: precheck.version,
    job: {
      jobId: job.id,
      status: job.status,
      failureCode: job.failureCode,
      retryable: job.retryable,
    },
    modelVersion: precheck.aiModelVersion,
    contractVersion: precheck.aiContractVersion,
    generatedAt: precheck.aiGeneratedAt,
    items: precheck.items.map(mapItem),
  };
}

function mapItem(
  item: Prisma.HandoffPrecheckItemGetPayload<{
    include: {
      answer: true;
      evidence: {
        include: {
          timelineInput: true;
          taskInput: { include: { sourceReferences: true } };
        };
      };
    };
  }>,
): HandoffPrecheckItem {
  const evidence = item.evidence.map(mapEvidence);
  return {
    itemId: item.id,
    patientId: patientIdFromEvidence(item.evidence),
    severity: item.severity,
    question: item.aiQuestion,
    reason: item.aiReason,
    evidence,
    answer: item.answer?.answerCode ?? null,
    comment: item.answer?.comment ?? null,
    version: item.version,
  };
}

function mapEvidence(
  evidence: Prisma.HandoffPrecheckEvidenceGetPayload<{
    include: {
      timelineInput: true;
      taskInput: { include: { sourceReferences: true } };
    };
  }>,
): HandoffPrecheckEvidence {
  if (evidence.sourceType === 'TIMELINE_EVENT' && evidence.timelineInput) {
    return {
      sourceType: 'TIMELINE_EVENT',
      sourceId: evidence.timelineInput.timelineEventId,
      sourceReference: evidence.timelineInput.sourceReference,
      occurredAt: evidence.timelineInput.occurredAt,
      excerptKind: 'SUMMARY',
      excerpt: evidence.timelineInput.summary,
    };
  }
  if (evidence.sourceType === 'TASK' && evidence.taskInput) {
    return {
      sourceType: 'TASK',
      sourceId: evidence.taskInput.taskId,
      sourceReference:
        evidence.taskInput.sourceReferences[0]?.reference ??
        `task:${evidence.taskInput.taskId}`,
      occurredAt: null,
      excerptKind: 'TASK_TITLE',
      excerpt: evidence.taskInput.title,
    };
  }
  throw new IdempotencyInvariantViolationError();
}

function patientIdFromEvidence(
  evidence: readonly {
    timelineInput: { patientId: string } | null;
    taskInput: { patientId: string | null } | null;
  }[],
): string {
  const patientId =
    evidence.find(({ timelineInput }) => timelineInput !== null)?.timelineInput
      ?.patientId ??
    evidence.find(({ taskInput }) => taskInput?.patientId !== null)?.taskInput
      ?.patientId;
  if (!patientId) throw new IdempotencyInvariantViolationError();
  return patientId;
}

async function lockPrecheckRow(
  transaction: Prisma.TransactionClient,
  context: HandoffPrecheckContext,
  precheckId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "HandoffPrecheck"
    WHERE "datasetId" = ${context.datasetId}::uuid
      AND "wardId" = ${context.wardId}::uuid
      AND "senderActorId" = ${context.actorId}::uuid
      AND "id" = ${precheckId}::uuid
    FOR UPDATE
  `);
  return rows.length === 1;
}

async function assertActiveClaim(
  transaction: Prisma.TransactionClient,
  claim: AiJobClaim,
  now: Date,
): Promise<void> {
  const job = await transaction.aiJob.findFirst({
    where: {
      id: claim.jobId,
      datasetId: claim.datasetId,
      actorId: claim.actorId,
      wardId: claim.wardId,
      operation: claim.operation,
      status: 'PROCESSING',
      leaseVersion: claim.leaseVersion,
      leaseExpiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (!job) throw new HandoffJobClaimLostError();
}

async function finishClaimSuccess(
  transaction: Prisma.TransactionClient,
  claim: AiJobClaim,
  idempotencyRecordId: string,
  resultReference: string,
  now: Date,
): Promise<void> {
  const job = await transaction.aiJob.updateMany({
    where: {
      id: claim.jobId,
      datasetId: claim.datasetId,
      actorId: claim.actorId,
      wardId: claim.wardId,
      operation: claim.operation,
      status: 'PROCESSING',
      leaseVersion: claim.leaseVersion,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: 'SUCCEEDED',
      resultReference,
      failureCode: null,
      retryable: null,
      version: { increment: 1 },
      updatedAt: now,
    },
  });
  if (job.count !== 1) throw new HandoffJobClaimLostError();
  const record = await transaction.idempotencyRecord.updateMany({
    where: {
      id: idempotencyRecordId,
      datasetId: claim.datasetId,
      status: 'PROCESSING',
    },
    data: { status: 'COMPLETED', resultReference, updatedAt: now },
  });
  if (record.count !== 1) throw new IdempotencyInvariantViolationError();
}

function assertClaimOperation(claim: AiJobClaim): void {
  if (claim.operation !== HANDOFF_JOB_OPERATIONS.PRECHECK) {
    throw new HandoffJobClaimLostError();
  }
}

function assertReplayMatches(
  wardId: string,
  requestHash: string,
  record: { wardId: string; requestHash: string },
): void {
  if (record.wardId !== wardId || record.requestHash !== requestHash) {
    throw new IdempotencyKeyReusedError();
  }
}

function asDatabaseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function hasPrismaErrorCode(
  error: unknown,
  expectedCode: string,
): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === expectedCode
  );
}
