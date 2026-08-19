import { createHash, randomUUID } from 'node:crypto';
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
  FrozenHandoffPrecheckItem,
  HandoffDraftContext,
  HandoffDraftDetail,
  HandoffDraftFrozenWork,
  HandoffDraftWarning,
  HandoffLinkedTask,
} from '../application/handoff-draft.models';
import type {
  HandoffDraftRepository,
  HandoffDraftReservation,
  PublishedHandoffDraftResult,
} from '../application/ports/handoff-draft.repository';
import type {
  HandoffPrecheckEvidence,
  HandoffPrecheckSourceSnapshot,
} from '../application/handoff-precheck.models';
import {
  HANDOFF_CLINICAL_SECTIONS,
  HANDOFF_JOB_OPERATIONS,
} from '../domain/handoff.constants';
import { encodeHandoffCursor } from '../domain/handoff-cursor';
import {
  HandoffAiResultInvalidError,
  HandoffCriticalAnswerRequiredError,
  HandoffGenerationConflictError,
  HandoffJobClaimLostError,
  HandoffNotFoundError,
  HandoffPrecheckLockedError,
  HandoffPrecheckNotFoundError,
  HandoffStateInvalidError,
} from '../domain/handoff.errors';
import { toSeoulDate } from '../domain/seoul-work-date';
import { appendFirstHandoffView } from './handoff-first-view';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

type SerializedSourceSnapshot = {
  capturedAt: string;
  patients: Array<{
    patientId: string;
    timelineEvents: Array<{
      id: string;
      patientId: string;
      occurredAt: string;
      type: 'OBSERVATION' | 'MEDICATION' | 'PROCEDURE' | 'REPORT' | 'TASK';
      source: 'MANUAL' | 'AI_AUDIO';
      summary: string;
      version: number;
      sourceReference: string;
    }>;
  }>;
  tasks: Array<{
    id: string;
    patientId: string | null;
    title: string;
    dueAt: string | null;
    effectivePriority: 'CRITICAL' | 'HIGH' | 'NORMAL';
    version: number;
    sourceReferences: string[];
    updatedAt: string;
  }>;
};

type StoredQuestion = { patientId: string; question: string; reason: string };

const precheckAggregateInclude = {
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
  items: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: {
      answer: true,
      evidence: {
        orderBy: [{ id: 'asc' as const }],
        include: { timelineInput: true, taskInput: true },
      },
    },
  },
} satisfies Prisma.HandoffPrecheckInclude;

const draftDetailInclude = {
  finalSnapshot: { select: { id: true } },
  generationAttempts: {
    orderBy: [{ sequence: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
  },
  frozenPrecheckItems: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: { evidence: { orderBy: [{ id: 'asc' as const }] } },
  },
  draftPatients: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: {
      sections: {
        orderBy: [{ section: 'asc' as const }, { id: 'asc' as const }],
        include: {
          citations: {
            orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
          },
        },
      },
    },
  },
  draftTasks: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: {
      sourceReferences: { orderBy: [{ reference: 'asc' as const }] },
    },
  },
  draftWarnings: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.HandoffInclude;

@Injectable()
export class PrismaHandoffDraftRepository implements HandoffDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findReplay(
    input: Parameters<HandoffDraftRepository['findReplay']>[0],
  ): Promise<HandoffDraftReservation | null> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          operation: HANDOFF_JOB_OPERATIONS.GENERATE,
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
    const attempt = await this.prisma.handoffGenerationAttempt.findFirst({
      where: { datasetId: input.context.datasetId, aiJobId: jobId },
      select: { handoffId: true },
    });
    if (!attempt) throw new IdempotencyInvariantViolationError();
    return { resourceId: attempt.handoffId, jobId, isReplay: true };
  }

  async reserve(
    input: Parameters<HandoffDraftRepository['reserve']>[0],
  ): Promise<HandoffDraftReservation> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.idempotencyRecord.create({
          data: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: HANDOFF_JOB_OPERATIONS.GENERATE,
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
            operation: HANDOFF_JOB_OPERATIONS.GENERATE,
            idempotencyRecordId: record.id,
            requestId: input.requestId,
            maxAttempts: input.maxAttempts,
          },
          select: { id: true },
        });

        const locked = await lockPrecheckRow(
          transaction,
          input.context,
          input.precheckId,
        );
        if (!locked) throw new HandoffPrecheckNotFoundError();
        const precheck = await loadPrecheckAggregate(
          transaction,
          input.context,
          input.precheckId,
        );
        if (!precheck) throw new HandoffPrecheckNotFoundError();
        const precheckJob = await transaction.aiJob.findFirst({
          where: {
            id: precheck.aiJobId,
            datasetId: input.context.datasetId,
            status: 'SUCCEEDED',
          },
          select: { id: true },
        });
        if (!precheckJob) throw new HandoffGenerationConflictError();
        if (
          precheck.items.some(
            (item) => item.severity === 'CRITICAL' && item.answer === null,
          )
        ) {
          throw new HandoffCriticalAnswerRequiredError();
        }

        const snapshot = mapStoredSnapshot(precheck);
        const serialized = serializeSourceSnapshot(snapshot);
        const frozenHash = hashJson(serialized);
        const existing = await transaction.handoff.findUnique({
          where: {
            handoff_precheck: {
              datasetId: input.context.datasetId,
              precheckId: input.precheckId,
            },
          },
          select: {
            id: true,
            status: true,
            version: true,
            templateKey: true,
            includeUnverified: true,
            frozenInputHash: true,
          },
        });

        let handoffId: string;
        let sequence = 1;
        if (existing) {
          if (
            existing.status !== 'GENERATING' ||
            existing.templateKey !== input.templateId ||
            existing.includeUnverified !== input.includeUnverified ||
            existing.frozenInputHash !== frozenHash
          ) {
            throw new HandoffGenerationConflictError();
          }
          const latest = await transaction.handoffGenerationAttempt.findFirst({
            where: {
              datasetId: input.context.datasetId,
              handoffId: existing.id,
            },
            orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
            select: { sequence: true, aiJobId: true },
          });
          const latestJob = latest
            ? await transaction.aiJob.findFirst({
                where: {
                  id: latest.aiJobId,
                  datasetId: input.context.datasetId,
                },
                select: { status: true },
              })
            : null;
          if (!latest || latestJob?.status !== 'FAILED') {
            throw new HandoffGenerationConflictError();
          }
          const root = await transaction.handoff.updateMany({
            where: {
              id: existing.id,
              datasetId: input.context.datasetId,
              status: 'GENERATING',
              version: existing.version,
            },
            data: { version: { increment: 1 }, updatedAt: input.now },
          });
          if (root.count !== 1) throw new HandoffGenerationConflictError();
          handoffId = existing.id;
          sequence = latest.sequence + 1;
        } else {
          const precheckLocked = await transaction.handoffPrecheck.updateMany({
            where: {
              id: precheck.id,
              datasetId: input.context.datasetId,
              wardId: input.context.wardId,
              senderActorId: input.context.actorId,
              lockedAt: null,
              version: precheck.version,
            },
            data: {
              lockedAt: input.now,
              version: { increment: 1 },
              updatedAt: input.now,
            },
          });
          if (precheckLocked.count !== 1)
            throw new HandoffPrecheckLockedError();
          const handoff = await transaction.handoff.create({
            data: {
              datasetId: input.context.datasetId,
              wardId: input.context.wardId,
              senderActorId: input.context.actorId,
              receiverActorId: precheck.receiverActorId,
              senderShiftId: precheck.senderShiftId,
              receiverShiftId: precheck.receiverShiftId,
              handoffDate: precheck.handoffDate,
              targetDuty: precheck.targetDuty,
              precheckId: precheck.id,
              precheckVersion: precheck.version + 1,
              templateKey: input.templateId,
              includeUnverified: input.includeUnverified,
              frozenInputPayload: toInputJson(serialized),
              frozenInputHash: frozenHash,
              createdAt: input.now,
              updatedAt: input.now,
            },
            select: { id: true },
          });
          handoffId = handoff.id;
          await persistFrozenItems(
            transaction,
            input.context.datasetId,
            handoffId,
            precheck.items,
            input.now,
          );
        }

        await transaction.handoffGenerationAttempt.create({
          data: {
            datasetId: input.context.datasetId,
            handoffId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: HANDOFF_JOB_OPERATIONS.GENERATE,
            aiJobId: job.id,
            idempotencyRecordId: record.id,
            requestHash: input.requestHash,
            requestId: input.requestId,
            sequence,
            createdAt: input.now,
            updatedAt: input.now,
          },
        });
        await createDraftAuditEvent(transaction, {
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          handoffId,
          senderActorId: input.context.actorId,
          receiverActorId: precheck.receiverActorId,
          actorId: input.context.actorId,
          eventType: sequence === 1 ? 'HANDOFF_CREATED' : 'GENERATION_RETRIED',
          occurredAt: input.now,
          payload: { generationSequence: sequence },
        });
        return { resourceId: handoffId, jobId: job.id, isReplay: false };
      });
    } catch (error: unknown) {
      if (!hasPrismaErrorCode(error, 'P2002')) throw error;
      const replay = await this.findReplay(input);
      if (!replay) throw new HandoffGenerationConflictError();
      return replay;
    }
  }

  async list(
    input: Parameters<HandoffDraftRepository['list']>[0],
  ): ReturnType<HandoffDraftRepository['list']> {
    const rows = await this.prisma.handoff.findMany({
      where: {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        OR: [
          { senderActorId: input.context.actorId },
          { receiverActorId: input.context.actorId, status: 'FINALIZED' },
        ],
        ...(input.date === undefined
          ? {}
          : { handoffDate: asDatabaseDate(input.date) }),
        status: input.status ?? { in: ['DRAFT', 'FINALIZED'] },
        ...(input.cursor === undefined
          ? {}
          : {
              AND: [
                {
                  OR: [
                    { updatedAt: { lt: input.cursor.updatedAt } },
                    {
                      updatedAt: input.cursor.updatedAt,
                      id: { lt: input.cursor.id },
                    },
                  ],
                },
              ],
            }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        _count: { select: { draftPatients: true, draftTasks: true } },
      },
    });
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        handoffId: row.id,
        status: row.status === 'DRAFT' ? 'DRAFT' : 'FINALIZED',
        patientCount: row._count.draftPatients,
        taskCount: row._count.draftTasks,
        updatedAt: row.updatedAt,
      })),
      nextCursor:
        rows.length > input.limit && last
          ? encodeHandoffCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async get(
    context: HandoffDraftContext,
    handoffId: string,
    viewedAt: Date,
  ): Promise<HandoffDraftDetail> {
    const handoff = await this.prisma.handoff.findFirst({
      where: {
        id: handoffId,
        datasetId: context.datasetId,
        wardId: context.wardId,
        OR: [
          { senderActorId: context.actorId },
          { receiverActorId: context.actorId, status: 'FINALIZED' },
        ],
      },
      include: draftDetailInclude,
    });
    if (!handoff) throw new HandoffNotFoundError();
    if (handoff.status === 'FINALIZED' && !handoff.finalSnapshot) {
      throw new IdempotencyInvariantViolationError();
    }
    const attempt = handoff.generationAttempts[0];
    if (!attempt) throw new IdempotencyInvariantViolationError();
    const job = await this.prisma.aiJob.findFirst({
      where: {
        id: attempt.aiJobId,
        datasetId: context.datasetId,
        wardId: context.wardId,
        operation: HANDOFF_JOB_OPERATIONS.GENERATE,
      },
      select: { id: true, status: true, failureCode: true, retryable: true },
    });
    if (!job) throw new IdempotencyInvariantViolationError();
    await appendFirstHandoffView(this.prisma, {
      datasetId: context.datasetId,
      wardId: context.wardId,
      handoffId: handoff.id,
      senderActorId: handoff.senderActorId,
      receiverActorId: handoff.receiverActorId,
      actorId: context.actorId,
      viewedAt,
    });
    return mapDetail(handoff, job);
  }

  async update(
    input: Parameters<HandoffDraftRepository['update']>[0],
  ): ReturnType<HandoffDraftRepository['update']> {
    return this.prisma.$transaction(async (transaction) => {
      const handoff = await transaction.handoff.findFirst({
        where: {
          id: input.handoffId,
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          senderActorId: input.context.actorId,
        },
        include: {
          draftPatients: {
            include: { sections: true },
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
          },
        },
      });
      if (!handoff) throw new HandoffNotFoundError();
      if (handoff.status !== 'DRAFT') throw new HandoffStateInvalidError();
      if (handoff.version !== input.version) {
        throw new VersionConflictError(input.version, handoff.version);
      }
      const storedPatientIds = handoff.draftPatients
        .map(({ patientId }) => patientId)
        .sort();
      const requestedPatientIds = input.patients
        .map(({ patientId }) => patientId)
        .sort();
      if (!sameStrings(storedPatientIds, requestedPatientIds)) {
        throw new HandoffStateInvalidError();
      }
      const root = await transaction.handoff.updateMany({
        where: {
          id: handoff.id,
          datasetId: input.context.datasetId,
          status: 'DRAFT',
          version: input.version,
        },
        data: { version: { increment: 1 }, updatedAt: input.now },
      });
      if (root.count !== 1) throw new VersionConflictError(input.version);

      for (const patient of input.patients) {
        const storedPatient = handoff.draftPatients.find(
          ({ patientId }) => patientId === patient.patientId,
        )!;
        for (const [section, currentText] of Object.entries(patient.sections)) {
          const storedSection = storedPatient.sections.find(
            (candidate) => candidate.section === section,
          );
          if (!storedSection) throw new HandoffStateInvalidError();
          await transaction.handoffDraftSection.update({
            where: { id: storedSection.id },
            data: {
              currentText,
              isModified: currentText !== storedSection.aiOriginalText,
              version: { increment: 1 },
              updatedAt: input.now,
            },
          });
        }
        await transaction.handoffDraftPatient.update({
          where: { id: storedPatient.id },
          data: { version: { increment: 1 }, updatedAt: input.now },
        });
      }
      await transaction.handoffDraftTaskSourceReference.deleteMany({
        where: { datasetId: input.context.datasetId, handoffId: handoff.id },
      });
      await transaction.handoffDraftLinkedTask.deleteMany({
        where: { datasetId: input.context.datasetId, handoffId: handoff.id },
      });
      await persistDraftTasks(
        transaction,
        input.context.datasetId,
        handoff.id,
        input.context.actorId,
        input.tasks,
        input.now,
      );
      await createDraftAuditEvent(transaction, {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        handoffId: handoff.id,
        senderActorId: handoff.senderActorId,
        receiverActorId: handoff.receiverActorId,
        actorId: input.context.actorId,
        eventType: 'DRAFT_UPDATED',
        occurredAt: input.now,
        payload: { version: input.version + 1 },
      });
      return {
        handoffId: handoff.id,
        status: 'DRAFT' as const,
        version: input.version + 1,
        updatedAt: input.now,
      };
    });
  }

  async getWork(claim: AiJobClaim): Promise<HandoffDraftFrozenWork> {
    assertClaimOperation(claim);
    const attempt = await this.prisma.handoffGenerationAttempt.findFirst({
      where: {
        aiJobId: claim.jobId,
        datasetId: claim.datasetId,
        handoff: {
          wardId: claim.wardId,
          senderActorId: claim.actorId,
          status: 'GENERATING',
        },
      },
      select: {
        handoff: {
          select: {
            id: true,
            templateKey: true,
            includeUnverified: true,
            frozenInputPayload: true,
            frozenPrecheckItems: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              include: { evidence: { orderBy: [{ id: 'asc' }] } },
            },
          },
        },
      },
    });
    if (!attempt) throw new HandoffJobClaimLostError();
    const snapshot = deserializeSourceSnapshot(
      attempt.handoff.frozenInputPayload,
    );
    const sources = createEvidenceMap(snapshot);
    return {
      handoffId: attempt.handoff.id,
      templateId: assertTemplateId(attempt.handoff.templateKey),
      includeUnverified: attempt.handoff.includeUnverified,
      snapshot,
      precheckItems: attempt.handoff.frozenPrecheckItems.map((item) =>
        mapFrozenItem(item, sources),
      ),
    };
  }

  async publishResult(input: {
    claim: AiJobClaim;
    result: PublishedHandoffDraftResult;
    now: Date;
  }): Promise<void> {
    assertClaimOperation(input.claim);
    if (input.result.requestId !== input.claim.requestId) {
      throw new HandoffAiResultInvalidError();
    }
    await this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.handoffGenerationAttempt.findFirst({
        where: { aiJobId: input.claim.jobId, datasetId: input.claim.datasetId },
        select: {
          id: true,
          idempotencyRecordId: true,
          handoff: {
            select: {
              id: true,
              wardId: true,
              senderActorId: true,
              receiverActorId: true,
              status: true,
              version: true,
              frozenInputPayload: true,
              frozenPrecheckItems: {
                select: {
                  sourcePrecheckItemId: true,
                  severity: true,
                  aiQuestion: true,
                  answerCode: true,
                  answerComment: true,
                  sourceItemVersion: true,
                  isWarningCandidate: true,
                  evidence: {
                    orderBy: [{ id: 'asc' }],
                    select: { sourceType: true, sourceId: true },
                  },
                },
              },
            },
          },
        },
      });
      await assertActiveClaim(transaction, input.claim, input.now);
      if (
        !attempt ||
        attempt.handoff.status !== 'GENERATING' ||
        attempt.handoff.wardId !== input.claim.wardId ||
        attempt.handoff.senderActorId !== input.claim.actorId
      ) {
        throw new HandoffJobClaimLostError();
      }
      const snapshot = deserializeSourceSnapshot(
        attempt.handoff.frozenInputPayload,
      );
      validateDraftResult(
        input.result,
        snapshot,
        new Set(
          attempt.handoff.frozenPrecheckItems.map(
            ({ sourcePrecheckItemId }) => sourcePrecheckItemId,
          ),
        ),
      );
      const evidenceMap = createEvidenceMap(snapshot);
      await persistPublishedDraft(
        transaction,
        input.claim.datasetId,
        attempt.handoff.id,
        input.claim.actorId,
        input.result,
        snapshot.tasks,
        attempt.handoff.frozenPrecheckItems
          .filter(({ isWarningCandidate }) => isWarningCandidate)
          .map((item) => toWarning(mapFrozenItem(item, evidenceMap), false)),
        input.now,
      );
      const root = await transaction.handoff.updateMany({
        where: {
          id: attempt.handoff.id,
          datasetId: input.claim.datasetId,
          status: 'GENERATING',
          version: attempt.handoff.version,
        },
        data: {
          status: 'DRAFT',
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });
      if (root.count !== 1) throw new HandoffJobClaimLostError();
      await transaction.handoffGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          aiModelVersion: input.result.modelVersion,
          aiContractVersion: input.result.contractVersion,
          aiGeneratedAt: input.result.generatedAt,
          publishedAt: input.now,
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });
      await createDraftAuditEvent(transaction, {
        datasetId: input.claim.datasetId,
        wardId: input.claim.wardId,
        handoffId: attempt.handoff.id,
        senderActorId: attempt.handoff.senderActorId,
        receiverActorId: attempt.handoff.receiverActorId,
        actorId: input.claim.actorId,
        eventType: 'DRAFT_GENERATED',
        occurredAt: input.now,
        payload: { version: attempt.handoff.version + 1 },
      });
      await finishClaimSuccess(
        transaction,
        input.claim,
        attempt.idempotencyRecordId,
        attempt.handoff.id,
        input.now,
      );
    });
  }
}

async function lockPrecheckRow(
  transaction: Prisma.TransactionClient,
  context: HandoffDraftContext,
  precheckId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "HandoffPrecheck"
    WHERE "datasetId" = ${context.datasetId}::uuid
      AND "wardId" = ${context.wardId}::uuid
      AND "senderActorId" = ${context.actorId}::uuid
      AND "id" = ${precheckId}::uuid
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadPrecheckAggregate(
  client: DatabaseClient,
  context: HandoffDraftContext,
  precheckId: string,
) {
  return client.handoffPrecheck.findFirst({
    where: {
      id: precheckId,
      datasetId: context.datasetId,
      wardId: context.wardId,
      senderActorId: context.actorId,
    },
    include: precheckAggregateInclude,
  });
}

type LoadedPrecheck = NonNullable<
  Awaited<ReturnType<typeof loadPrecheckAggregate>>
>;

function mapStoredSnapshot(
  precheck: LoadedPrecheck,
): HandoffPrecheckSourceSnapshot {
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

async function persistFrozenItems(
  transaction: Prisma.TransactionClient,
  datasetId: string,
  handoffId: string,
  items: LoadedPrecheck['items'],
  now: Date,
): Promise<void> {
  for (const item of items) {
    const id = randomUUID();
    await transaction.handoffFrozenPrecheckItem.create({
      data: {
        id,
        datasetId,
        handoffId,
        sourcePrecheckItemId: item.id,
        position: item.position,
        severity: item.severity,
        aiQuestion: JSON.stringify({
          patientId: patientIdFromEvidence(item.evidence),
          question: item.aiQuestion,
          reason: item.aiReason,
        } satisfies StoredQuestion),
        answerCode: item.answer?.answerCode ?? null,
        answerComment: item.answer?.comment ?? null,
        answeredByActorId: item.answer?.answeredByActorId ?? null,
        answeredAt: item.answer?.answeredAt ?? null,
        sourceItemVersion: item.version,
        sourceAnswerVersion: item.answer?.version ?? null,
        isWarningCandidate:
          item.answer === null || item.answer.answerCode === 'UNVERIFIED',
        createdAt: now,
      },
    });
    if (item.evidence.length > 0) {
      await transaction.handoffFrozenPrecheckEvidence.createMany({
        data: item.evidence.map((evidence) => ({
          id: randomUUID(),
          datasetId,
          handoffId,
          frozenItemId: id,
          sourceType: evidence.sourceType,
          sourceId:
            evidence.sourceType === 'TIMELINE_EVENT'
              ? evidence.timelineInput!.timelineEventId
              : evidence.taskInput!.taskId,
          createdAt: now,
        })),
      });
    }
  }
}

function mapDetail(
  handoff: Prisma.HandoffGetPayload<{ include: typeof draftDetailInclude }>,
  job: {
    id: string;
    status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
    failureCode: string | null;
    retryable: boolean | null;
  },
): HandoffDraftDetail {
  const snapshot = deserializeSourceSnapshot(handoff.frozenInputPayload);
  const evidenceMap = createEvidenceMap(snapshot);
  return {
    handoffId: handoff.id,
    status: handoff.status,
    version: handoff.version,
    date: toSeoulDate(handoff.handoffDate),
    senderActorId: handoff.senderActorId,
    receiverActorId: handoff.receiverActorId,
    generationJob: {
      jobId: job.id,
      status: job.status,
      failureCode: job.failureCode,
      retryable: job.retryable,
    },
    draft:
      handoff.status === 'DRAFT'
        ? {
            templateId: assertTemplateId(handoff.templateKey),
            includeUnverified: handoff.includeUnverified,
            patients: handoff.draftPatients.map((patient) => ({
              patientId: patient.patientId,
              sections: patient.sections.map((section) => ({
                section: section.section,
                aiOriginalContent: section.aiOriginalText,
                currentContent: section.currentText,
                isModified: section.isModified,
                citations: section.citations.map((citation) => {
                  const evidence = evidenceMap.get(
                    sourceKey(citation.sourceType, citation.sourceId),
                  );
                  if (!evidence) throw new IdempotencyInvariantViolationError();
                  return evidence;
                }),
              })),
            })),
            tasks: handoff.draftTasks.map(mapDraftTask),
            warnings: handoff.draftWarnings.map((warning) => {
              const decoded = decodeWarning(warning.message);
              return {
                ...decoded,
                isIncludedInAiInput: warning.isIncludedInAiInput,
              };
            }),
          }
        : null,
    updatedAt: handoff.updatedAt,
  };
}

function mapDraftTask(
  task: Prisma.HandoffDraftLinkedTaskGetPayload<{
    include: { sourceReferences: true };
  }>,
): HandoffLinkedTask {
  return {
    id: task.taskId,
    patientId: task.patientId,
    title: task.title,
    dueAt: task.dueAt,
    effectivePriority: task.effectivePriority,
    version: task.sourceVersion,
    sourceReferences: task.sourceReferences.map(({ reference }) => reference),
    updatedAt: task.sourceUpdatedAt,
  };
}

type StoredFrozenItem = {
  sourcePrecheckItemId: string;
  severity: 'CRITICAL' | 'RECOMMENDED';
  aiQuestion: string;
  answerCode:
    'NO_ISSUE' | 'INCLUDE_HANDOFF' | 'UNVERIFIED' | 'NOT_APPLICABLE' | null;
  answerComment: string | null;
  sourceItemVersion: number;
  evidence: readonly {
    sourceType: 'TIMELINE_EVENT' | 'TASK';
    sourceId: string;
  }[];
};

function mapFrozenItem(
  item: StoredFrozenItem,
  evidenceMap: ReadonlyMap<string, HandoffPrecheckEvidence>,
): FrozenHandoffPrecheckItem {
  const stored = decodeQuestion(item.aiQuestion);
  return {
    itemId: item.sourcePrecheckItemId,
    patientId: stored.patientId,
    severity: item.severity,
    question: stored.question,
    reason: stored.reason,
    evidence: item.evidence.map((evidence) => {
      const resolved = evidenceMap.get(
        sourceKey(evidence.sourceType, evidence.sourceId),
      );
      if (!resolved) throw new IdempotencyInvariantViolationError();
      return resolved;
    }),
    answer: item.answerCode,
    comment: item.answerComment,
    version: item.sourceItemVersion,
  };
}

function createEvidenceMap(snapshot: HandoffPrecheckSourceSnapshot) {
  return new Map<string, HandoffPrecheckEvidence>([
    ...snapshot.patients.flatMap((patient) =>
      patient.timelineEvents.map(
        (event) =>
          [
            sourceKey('TIMELINE_EVENT', event.id),
            createTimelineEvidence(event),
          ] as const,
      ),
    ),
    ...snapshot.tasks.map(
      (task) =>
        [
          sourceKey('TASK', task.id),
          {
            sourceType: 'TASK' as const,
            sourceId: task.id,
            sourceReference: task.sourceReferences[0] ?? `task:${task.id}`,
            occurredAt: null,
            excerptKind: 'TASK_TITLE' as const,
            excerpt: task.title,
          },
        ] as const,
    ),
  ]);
}

function createTimelineEvidence(
  event: HandoffPrecheckSourceSnapshot['patients'][number]['timelineEvents'][number],
) {
  return {
    sourceType: 'TIMELINE_EVENT' as const,
    sourceId: event.id,
    sourceReference: event.sourceReference,
    occurredAt: event.occurredAt,
    excerptKind: 'SUMMARY' as const,
    excerpt: event.summary,
  };
}

async function persistPublishedDraft(
  transaction: Prisma.TransactionClient,
  datasetId: string,
  handoffId: string,
  actorId: string,
  result: PublishedHandoffDraftResult,
  tasks: readonly HandoffLinkedTask[],
  frozenWarnings: readonly HandoffDraftWarning[],
  now: Date,
): Promise<void> {
  for (const [patientPosition, patient] of result.patients.entries()) {
    const patientId = randomUUID();
    await transaction.handoffDraftPatient.create({
      data: {
        id: patientId,
        datasetId,
        handoffId,
        patientId: patient.patientId,
        position: patientPosition,
        createdAt: now,
        updatedAt: now,
      },
    });
    for (const section of patient.sections) {
      const sectionId = randomUUID();
      await transaction.handoffDraftSection.create({
        data: {
          id: sectionId,
          datasetId,
          handoffId,
          draftPatientId: patientId,
          section: section.section,
          aiOriginalText: section.aiOriginalContent,
          currentText: section.currentContent,
          isModified: section.isModified,
          createdAt: now,
          updatedAt: now,
        },
      });
      if (section.citations.length > 0) {
        await transaction.handoffDraftCitation.createMany({
          data: section.citations.map((citation, position) => ({
            id: randomUUID(),
            datasetId,
            handoffId,
            draftPatientId: patientId,
            draftSectionId: sectionId,
            sourceType: citation.sourceType,
            sourceId: citation.sourceId,
            position,
            createdAt: now,
          })),
        });
      }
    }
  }
  await persistDraftTasks(
    transaction,
    datasetId,
    handoffId,
    actorId,
    tasks,
    now,
  );
  const aiWarningIds = new Set(result.warnings.map(({ itemId }) => itemId));
  const byItem = new Map(
    [
      ...frozenWarnings,
      ...result.warnings.map((warning) => ({
        ...warning,
        isIncludedInAiInput: true,
      })),
    ].map((warning) => [warning.itemId, warning]),
  );
  if (byItem.size > 0) {
    await transaction.handoffDraftWarning.createMany({
      data: [...byItem.values()].map((warning) => ({
        id: randomUUID(),
        datasetId,
        handoffId,
        precheckItemId: warning.itemId,
        warningType:
          warning.answer === 'UNVERIFIED'
            ? 'UNVERIFIED'
            : 'UNANSWERED_RECOMMENDED',
        message: JSON.stringify(warning),
        isIncludedInAiInput: aiWarningIds.has(warning.itemId),
        createdAt: now,
        updatedAt: now,
      })),
    });
  }
}

async function persistDraftTasks(
  transaction: Prisma.TransactionClient,
  datasetId: string,
  handoffId: string,
  actorId: string,
  tasks: readonly HandoffLinkedTask[],
  now: Date,
): Promise<void> {
  for (const [position, task] of tasks.entries()) {
    const linkedTaskId = randomUUID();
    await transaction.handoffDraftLinkedTask.create({
      data: {
        id: linkedTaskId,
        datasetId,
        handoffId,
        taskId: task.id,
        patientId: task.patientId,
        title: task.title,
        dueAt: task.dueAt,
        effectivePriority: task.effectivePriority,
        sourceVersion: task.version,
        sourceUpdatedAt: task.updatedAt,
        linkedByActorId: actorId,
        position,
        createdAt: now,
        updatedAt: now,
      },
    });
    if (task.sourceReferences.length > 0) {
      await transaction.handoffDraftTaskSourceReference.createMany({
        data: task.sourceReferences.map((reference) => ({
          id: randomUUID(),
          datasetId,
          handoffId,
          linkedTaskId,
          reference,
          createdAt: now,
        })),
      });
    }
  }
}

function validateDraftResult(
  result: PublishedHandoffDraftResult,
  snapshot: HandoffPrecheckSourceSnapshot,
  precheckItemIds: ReadonlySet<string>,
): void {
  const patientIds = new Set(
    snapshot.patients.map(({ patientId }) => patientId),
  );
  const sourcePatients = new Map([
    ...snapshot.patients.flatMap((patient) =>
      patient.timelineEvents.map(
        (event) =>
          [sourceKey('TIMELINE_EVENT', event.id), patient.patientId] as const,
      ),
    ),
    ...snapshot.tasks.flatMap((task) =>
      task.patientId === null
        ? []
        : [[sourceKey('TASK', task.id), task.patientId] as const],
    ),
  ]);
  if (
    result.patients.length !== patientIds.size ||
    new Set(result.patients.map(({ patientId }) => patientId)).size !==
      patientIds.size ||
    result.patients.some(({ patientId }) => !patientIds.has(patientId))
  ) {
    throw new HandoffAiResultInvalidError();
  }
  for (const patient of result.patients) {
    const sectionNames = new Set(
      patient.sections.map(({ section }) => section),
    );
    if (
      patient.sections.length !== 6 ||
      sectionNames.size !== 6 ||
      !HANDOFF_CLINICAL_SECTIONS.every((section) => sectionNames.has(section))
    ) {
      throw new HandoffAiResultInvalidError();
    }
    for (const section of patient.sections) {
      if (
        section.citations.some(
          (citation) =>
            sourcePatients.get(
              sourceKey(citation.sourceType, citation.sourceId),
            ) !== patient.patientId,
        )
      ) {
        throw new HandoffAiResultInvalidError();
      }
    }
  }
  if (result.warnings.some(({ itemId }) => !precheckItemIds.has(itemId))) {
    throw new HandoffAiResultInvalidError();
  }
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

async function createDraftAuditEvent(
  client: DatabaseClient,
  input: {
    datasetId: string;
    wardId: string;
    handoffId: string;
    senderActorId: string;
    receiverActorId: string;
    actorId: string;
    eventType:
      | 'HANDOFF_CREATED'
      | 'GENERATION_RETRIED'
      | 'DRAFT_GENERATED'
      | 'DRAFT_UPDATED';
    occurredAt: Date;
    payload: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await client.handoffAuditEvent.create({
    data: {
      datasetId: input.datasetId,
      wardId: input.wardId,
      handoffId: input.handoffId,
      senderActorId: input.senderActorId,
      receiverActorId: input.receiverActorId,
      actorId: input.actorId,
      eventType: input.eventType,
      eventPayload: toInputJson(input.payload),
      occurredAt: input.occurredAt,
      createdAt: input.occurredAt,
    },
  });
}

function toWarning(
  item: FrozenHandoffPrecheckItem,
  isIncludedInAiInput: boolean,
): HandoffDraftWarning {
  return {
    itemId: item.itemId,
    patientId: item.patientId,
    severity: item.severity,
    answer: item.answer,
    question: item.question,
    isIncludedInAiInput,
  };
}

function decodeWarning(
  value: string,
): Omit<HandoffDraftWarning, 'isIncludedInAiInput'> {
  const parsed = JSON.parse(value) as HandoffDraftWarning;
  return {
    itemId: parsed.itemId,
    patientId: parsed.patientId,
    severity: parsed.severity,
    answer: parsed.answer,
    question: parsed.question,
  };
}

function decodeQuestion(value: string): StoredQuestion {
  const parsed = JSON.parse(value) as StoredQuestion;
  if (
    typeof parsed.patientId !== 'string' ||
    typeof parsed.question !== 'string' ||
    typeof parsed.reason !== 'string'
  ) {
    throw new IdempotencyInvariantViolationError();
  }
  return parsed;
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

function serializeSourceSnapshot(
  snapshot: HandoffPrecheckSourceSnapshot,
): SerializedSourceSnapshot {
  return {
    capturedAt: snapshot.capturedAt.toISOString(),
    patients: snapshot.patients.map((patient) => ({
      patientId: patient.patientId,
      timelineEvents: patient.timelineEvents.map((event) => ({
        ...event,
        occurredAt: event.occurredAt.toISOString(),
      })),
    })),
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      dueAt: task.dueAt?.toISOString() ?? null,
      sourceReferences: [...task.sourceReferences],
      updatedAt: task.updatedAt.toISOString(),
    })),
  };
}

function deserializeSourceSnapshot(
  value: Prisma.JsonValue,
): HandoffPrecheckSourceSnapshot {
  const parsed = value as unknown as SerializedSourceSnapshot;
  return {
    capturedAt: new Date(parsed.capturedAt),
    patients: parsed.patients.map((patient) => ({
      patientId: patient.patientId,
      timelineEvents: patient.timelineEvents.map((event) => ({
        ...event,
        occurredAt: new Date(event.occurredAt),
      })),
    })),
    tasks: parsed.tasks.map((task) => ({
      ...task,
      dueAt: task.dueAt === null ? null : new Date(task.dueAt),
      updatedAt: new Date(task.updatedAt),
    })),
  };
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
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

function assertClaimOperation(claim: AiJobClaim): void {
  if (claim.operation !== HANDOFF_JOB_OPERATIONS.GENERATE) {
    throw new HandoffJobClaimLostError();
  }
}

function assertTemplateId(value: string): 'NURSING_HANDOFF_V1' {
  if (value !== 'NURSING_HANDOFF_V1') throw new HandoffStateInvalidError();
  return value;
}

function sourceKey(type: 'TIMELINE_EVENT' | 'TASK', id: string): string {
  return `${type}:${id}`;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
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
