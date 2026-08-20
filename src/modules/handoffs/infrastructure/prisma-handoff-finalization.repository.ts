import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
  IdempotencyRequestInProgressError,
} from '../../../common/idempotency/idempotency.errors';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  FinalizeHandoffCommand,
  FinalizedHandoff,
  HandoffFinalSnapshot,
  HandoffFinalizationContext,
} from '../application/handoff-finalization.models';
import type { HandoffFinalizationRepository } from '../application/ports/handoff-finalization.repository';
import type { HandoffPrecheckEvidence } from '../application/handoff-precheck.models';
import { assertFinalizationPolicy } from '../domain/handoff-finalization.policy';
import {
  HANDOFF_CLINICAL_SECTIONS,
  HANDOFF_JOB_OPERATIONS,
} from '../domain/handoff.constants';
import {
  HandoffNotFoundError,
  HandoffStateInvalidError,
} from '../domain/handoff.errors';

const FINALIZE_OPERATION = 'handoffs.finalize';

type SerializedSourceSnapshot = {
  capturedAt: string;
  patients: Array<{
    patientId: string;
    timelineEvents: Array<{
      id: string;
      patientId: string;
      occurredAt: string;
      summary: string;
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

type StoredQuestion = {
  patientId: string;
  question: string;
  reason: string;
};

const finalizationInclude = {
  generationAttempts: {
    orderBy: [{ sequence: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: { aiJobId: true },
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
export class PrismaHandoffFinalizationRepository implements HandoffFinalizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async finalize(input: FinalizeHandoffCommand): Promise<FinalizedHandoff> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.idempotencyRecord.create({
          data: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: FINALIZE_OPERATION,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            createdAt: input.now,
            updatedAt: input.now,
          },
          select: { id: true },
        });

        if (
          !(await lockHandoffRow(transaction, input.context, input.handoffId))
        ) {
          throw new HandoffNotFoundError();
        }
        const handoff = await loadHandoffForFinalization(
          transaction,
          input.context,
          input.handoffId,
        );
        if (!handoff) throw new HandoffNotFoundError();
        if (handoff.version !== input.version) {
          throw new VersionConflictError(input.version, handoff.version);
        }
        if (handoff.status !== 'DRAFT') {
          throw new HandoffStateInvalidError();
        }

        const latestAttempt = handoff.generationAttempts[0];
        const generationJob = latestAttempt
          ? await transaction.aiJob.findFirst({
              where: {
                id: latestAttempt.aiJobId,
                datasetId: input.context.datasetId,
                wardId: input.context.wardId,
                operation: HANDOFF_JOB_OPERATIONS.GENERATE,
                status: 'SUCCEEDED',
              },
              select: { id: true },
            })
          : null;
        if (!generationJob) throw new HandoffStateInvalidError();

        const policy = assertFinalizationPolicy(
          handoff.frozenPrecheckItems.map((item) => ({
            severity: item.severity,
            answer: item.answerCode,
          })),
          input.unverifiedHandling,
        );
        const snapshot = createFinalSnapshot(handoff, input);
        const serialized = serializeFinalSnapshot(snapshot);
        await transaction.handoffFinalSnapshot.create({
          data: {
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
            handoffId: handoff.id,
            senderActorId: handoff.senderActorId,
            receiverActorId: handoff.receiverActorId,
            finalizedByActorId: input.context.actorId,
            resolution: input.unverifiedHandling,
            sourceDraftVersion: input.version,
            precheckVersion: handoff.precheckVersion,
            templateKey: handoff.templateKey,
            includeUnverified: handoff.includeUnverified,
            idempotencyRecordId: record.id,
            requestHash: input.requestHash,
            snapshotPayload: toInputJson(serialized),
            snapshotHash: hashJson(serialized),
            finalizedAt: input.now,
            createdAt: input.now,
          },
        });

        const updated = await transaction.handoff.updateMany({
          where: {
            id: handoff.id,
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
            senderActorId: input.context.actorId,
            status: 'DRAFT',
            version: input.version,
          },
          data: {
            status: 'FINALIZED',
            finalizedAt: input.now,
            version: { increment: 1 },
            updatedAt: input.now,
          },
        });
        if (updated.count !== 1) {
          throw new VersionConflictError(input.version);
        }

        await transaction.handoffAuditEvent.create({
          data: {
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
            handoffId: handoff.id,
            senderActorId: handoff.senderActorId,
            receiverActorId: handoff.receiverActorId,
            actorId: input.context.actorId,
            eventType: 'FINALIZED',
            deduplicationKey: `finalized:${record.id}`,
            eventPayload: toInputJson({
              requestId: input.requestId,
              unverifiedHandling: input.unverifiedHandling,
              version: input.version + 1,
              warningItemIds: policy.warningItemIndexes.map(
                (index) =>
                  handoff.frozenPrecheckItems[index]!.sourcePrecheckItemId,
              ),
            }),
            occurredAt: input.now,
            createdAt: input.now,
          },
        });
        const completed = await transaction.idempotencyRecord.updateMany({
          where: {
            id: record.id,
            datasetId: input.context.datasetId,
            status: 'PROCESSING',
          },
          data: {
            status: 'COMPLETED',
            resultReference: handoff.id,
            updatedAt: input.now,
          },
        });
        if (completed.count !== 1) {
          throw new IdempotencyInvariantViolationError();
        }

        return {
          handoffId: handoff.id,
          status: 'FINALIZED',
          finalizedAt: input.now,
          version: input.version + 1,
        };
      });
    } catch (error: unknown) {
      if (!hasPrismaErrorCode(error, 'P2002')) throw error;
      return this.replayFinalize(input);
    }
  }

  private async replayFinalize(
    input: FinalizeHandoffCommand,
  ): Promise<FinalizedHandoff> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          operation: FINALIZE_OPERATION,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        wardId: true,
        requestHash: true,
        status: true,
        resultReference: true,
      },
    });
    if (!record) throw new VersionConflictError(input.version);
    if (
      record.wardId !== input.context.wardId ||
      record.requestHash !== input.requestHash
    ) {
      throw new IdempotencyKeyReusedError();
    }
    if (record.status !== 'COMPLETED') {
      throw new IdempotencyRequestInProgressError();
    }
    if (!record.resultReference) {
      throw new IdempotencyInvariantViolationError();
    }
    const handoff = await this.prisma.handoff.findFirst({
      where: {
        id: record.resultReference,
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        senderActorId: input.context.actorId,
        status: 'FINALIZED',
      },
      select: { id: true, finalizedAt: true, version: true },
    });
    if (!handoff?.finalizedAt) {
      throw new IdempotencyInvariantViolationError();
    }
    return {
      handoffId: handoff.id,
      status: 'FINALIZED',
      finalizedAt: handoff.finalizedAt,
      version: handoff.version,
    };
  }
}

async function lockHandoffRow(
  transaction: Prisma.TransactionClient,
  context: HandoffFinalizationContext,
  handoffId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Handoff"
    WHERE "datasetId" = ${context.datasetId}::uuid
      AND "wardId" = ${context.wardId}::uuid
      AND "senderActorId" = ${context.actorId}::uuid
      AND "id" = ${handoffId}::uuid
    FOR UPDATE
  `);
  return rows.length === 1;
}

function loadHandoffForFinalization(
  transaction: Prisma.TransactionClient,
  context: HandoffFinalizationContext,
  handoffId: string,
) {
  return transaction.handoff.findFirst({
    where: {
      id: handoffId,
      datasetId: context.datasetId,
      wardId: context.wardId,
      senderActorId: context.actorId,
    },
    include: finalizationInclude,
  });
}

type LoadedHandoff = NonNullable<
  Awaited<ReturnType<typeof loadHandoffForFinalization>>
>;

function createFinalSnapshot(
  handoff: LoadedHandoff,
  input: FinalizeHandoffCommand,
): HandoffFinalSnapshot {
  if (handoff.templateKey !== 'NURSING_HANDOFF_V1') {
    throw new IdempotencyInvariantViolationError();
  }
  const evidenceBySource = createEvidenceMap(handoff.frozenInputPayload);
  const draftWarnings = new Map(
    handoff.draftWarnings.flatMap((warning) =>
      warning.precheckItemId === null
        ? []
        : [
            [
              warning.precheckItemId,
              {
                isIncludedInAiInput: warning.isIncludedInAiInput,
                message: decodeWarningMessage(warning.message),
                warningType: warning.warningType,
              },
            ] as const,
          ],
    ),
  );
  const precheckItems = handoff.frozenPrecheckItems.map((item) => {
    const stored = decodeQuestion(item.aiQuestion);
    return {
      itemId: item.sourcePrecheckItemId,
      patientId: stored.patientId,
      severity: item.severity,
      question: stored.question,
      reason: stored.reason,
      evidence: item.evidence.map((evidence) =>
        requireEvidence(
          evidenceBySource,
          evidence.sourceType,
          evidence.sourceId,
        ),
      ),
      answer: item.answerCode,
      comment: item.answerComment,
      answeredByActorId: item.answeredByActorId,
      answeredAt: item.answeredAt,
      sourceItemVersion: item.sourceItemVersion,
      sourceAnswerVersion: item.sourceAnswerVersion,
    };
  });

  return {
    snapshotVersion: 1,
    sourceDraftVersion: input.version,
    precheckVersion: handoff.precheckVersion,
    templateId: handoff.templateKey,
    includeUnverified: handoff.includeUnverified,
    unverifiedHandling: input.unverifiedHandling,
    senderActorId: handoff.senderActorId,
    receiverActorId: handoff.receiverActorId,
    patients: handoff.draftPatients.map((patient) => {
      assertClinicalSections(patient.sections.map(({ section }) => section));
      return {
        patientId: patient.patientId,
        sections: patient.sections.map((section) => ({
          section: section.section,
          aiOriginalContent: section.aiOriginalText,
          currentContent: section.currentText,
          isModified: section.isModified,
          citations: section.citations.map((citation) =>
            requireEvidence(
              evidenceBySource,
              citation.sourceType,
              citation.sourceId,
            ),
          ),
        })),
      };
    }),
    tasks: handoff.draftTasks.map((task) => ({
      taskId: task.taskId,
      patientId: task.patientId,
      title: task.title,
      dueAt: task.dueAt,
      effectivePriority: task.effectivePriority,
      sourceVersion: task.sourceVersion,
      sourceUpdatedAt: task.sourceUpdatedAt,
      sourceReferences: task.sourceReferences.map(({ reference }) => reference),
    })),
    precheckItems,
    warnings: precheckItems.flatMap((item) => {
      if (item.answer !== null && item.answer !== 'UNVERIFIED') return [];
      const stored = draftWarnings.get(item.itemId);
      const warningType =
        item.answer === 'UNVERIFIED'
          ? ('UNVERIFIED' as const)
          : ('UNANSWERED_RECOMMENDED' as const);
      return [
        {
          itemId: item.itemId,
          patientId: item.patientId,
          severity: item.severity,
          answer: item.answer,
          question: item.question,
          warningType,
          message: stored?.message ?? item.question,
          isIncludedInAiInput: stored?.isIncludedInAiInput ?? false,
        },
      ];
    }),
    finalizedByActorId: input.context.actorId,
    finalizedAt: input.now,
  };
}

function createEvidenceMap(
  value: Prisma.JsonValue,
): ReadonlyMap<string, HandoffPrecheckEvidence> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new IdempotencyInvariantViolationError();
  }
  const snapshot = value as unknown as SerializedSourceSnapshot;
  if (!Array.isArray(snapshot.patients) || !Array.isArray(snapshot.tasks)) {
    throw new IdempotencyInvariantViolationError();
  }
  const evidence = new Map<string, HandoffPrecheckEvidence>();
  for (const patient of snapshot.patients) {
    if (!Array.isArray(patient.timelineEvents)) {
      throw new IdempotencyInvariantViolationError();
    }
    for (const event of patient.timelineEvents) {
      const occurredAt = new Date(event.occurredAt);
      if (
        typeof event.id !== 'string' ||
        typeof event.sourceReference !== 'string' ||
        typeof event.summary !== 'string' ||
        Number.isNaN(occurredAt.getTime())
      ) {
        throw new IdempotencyInvariantViolationError();
      }
      evidence.set(sourceKey('TIMELINE_EVENT', event.id), {
        sourceType: 'TIMELINE_EVENT',
        sourceId: event.id,
        sourceReference: event.sourceReference,
        occurredAt,
        excerptKind: 'SUMMARY',
        excerpt: event.summary,
      });
    }
  }
  for (const task of snapshot.tasks) {
    if (
      typeof task.id !== 'string' ||
      typeof task.title !== 'string' ||
      !Array.isArray(task.sourceReferences)
    ) {
      throw new IdempotencyInvariantViolationError();
    }
    evidence.set(sourceKey('TASK', task.id), {
      sourceType: 'TASK',
      sourceId: task.id,
      sourceReference: task.sourceReferences[0] ?? task.id,
      occurredAt: null,
      excerptKind: 'TASK_TITLE',
      excerpt: task.title,
    });
  }
  return evidence;
}

function requireEvidence(
  evidence: ReadonlyMap<string, HandoffPrecheckEvidence>,
  sourceType: 'TIMELINE_EVENT' | 'TASK',
  sourceId: string,
): HandoffPrecheckEvidence {
  const found = evidence.get(sourceKey(sourceType, sourceId));
  if (!found) throw new IdempotencyInvariantViolationError();
  return found;
}

function decodeQuestion(value: string): StoredQuestion {
  try {
    const parsed = JSON.parse(value) as Partial<StoredQuestion>;
    if (
      typeof parsed.patientId === 'string' &&
      typeof parsed.question === 'string' &&
      typeof parsed.reason === 'string'
    ) {
      return parsed as StoredQuestion;
    }
  } catch {
    // Invalid stored data must not be published as an immutable snapshot.
  }
  throw new IdempotencyInvariantViolationError();
}

function decodeWarningMessage(value: string): string {
  try {
    const parsed = JSON.parse(value) as { question?: unknown };
    if (typeof parsed.question === 'string') return parsed.question;
  } catch {
    // Legacy plain warning text remains safe to preserve.
  }
  return value;
}

function assertClinicalSections(
  sections: readonly (typeof HANDOFF_CLINICAL_SECTIONS)[number][],
): void {
  const found = new Set(sections);
  if (
    sections.length !== HANDOFF_CLINICAL_SECTIONS.length ||
    found.size !== HANDOFF_CLINICAL_SECTIONS.length ||
    !HANDOFF_CLINICAL_SECTIONS.every((section) => found.has(section))
  ) {
    throw new IdempotencyInvariantViolationError();
  }
}

function serializeFinalSnapshot(snapshot: HandoffFinalSnapshot) {
  return {
    ...snapshot,
    patients: snapshot.patients.map((patient) => ({
      ...patient,
      sections: patient.sections.map((section) => ({
        ...section,
        citations: section.citations.map((citation) => ({
          ...citation,
          occurredAt: citation.occurredAt?.toISOString() ?? null,
        })),
      })),
    })),
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      dueAt: task.dueAt?.toISOString() ?? null,
      sourceUpdatedAt: task.sourceUpdatedAt.toISOString(),
      sourceReferences: [...task.sourceReferences],
    })),
    precheckItems: snapshot.precheckItems.map((item) => ({
      ...item,
      evidence: item.evidence.map((entry) => ({
        ...entry,
        occurredAt: entry.occurredAt?.toISOString() ?? null,
      })),
      answeredAt: item.answeredAt?.toISOString() ?? null,
    })),
    warnings: [...snapshot.warnings],
    finalizedAt: snapshot.finalizedAt.toISOString(),
  };
}

function sourceKey(type: 'TIMELINE_EVENT' | 'TASK', id: string): string {
  return `${type}:${id}`;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
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

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
