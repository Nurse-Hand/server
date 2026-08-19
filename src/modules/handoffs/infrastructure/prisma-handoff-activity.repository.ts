import { Injectable } from '@nestjs/common';
import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
  IdempotencyRequestInProgressError,
} from '../../../common/idempotency/idempotency.errors';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  CreateHandoffAcknowledgementCommand,
  CreatedHandoffAcknowledgement,
  HandoffHistoryEventType,
  HandoffHistoryMetadata,
} from '../application/handoff-activity.models';
import type { HandoffActivityRepository } from '../application/ports/handoff-activity.repository';
import { assertAcknowledgementTransition } from '../domain/handoff-acknowledgement.policy';
import { encodeHandoffHistoryCursor } from '../domain/handoff-history-cursor';
import {
  HandoffAcknowledgementDuplicateError,
  HandoffNotFoundError,
  HandoffStateInvalidError,
} from '../domain/handoff.errors';
import { appendFirstHandoffView } from './handoff-first-view';

const ACKNOWLEDGE_OPERATION = 'handoffs.acknowledge';

@Injectable()
export class PrismaHandoffActivityRepository implements HandoffActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async acknowledge(
    input: CreateHandoffAcknowledgementCommand,
  ): Promise<CreatedHandoffAcknowledgement> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.idempotencyRecord.create({
          data: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: ACKNOWLEDGE_OPERATION,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            createdAt: input.now,
            updatedAt: input.now,
          },
          select: { id: true },
        });
        if (!(await lockReceiverHandoff(transaction, input))) {
          throw new HandoffNotFoundError();
        }
        const handoff = await transaction.handoff.findFirst({
          where: {
            id: input.handoffId,
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
            receiverActorId: input.context.actorId,
          },
          select: {
            id: true,
            status: true,
            senderActorId: true,
            receiverActorId: true,
            finalSnapshot: { select: { id: true } },
            acknowledgements: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { status: true },
            },
          },
        });
        if (!handoff) throw new HandoffNotFoundError();
        if (handoff.status !== 'FINALIZED' || !handoff.finalSnapshot) {
          throw new HandoffStateInvalidError();
        }
        assertAcknowledgementTransition(
          handoff.acknowledgements[0]?.status ?? null,
          input.status,
        );
        const acknowledgement = await transaction.handoffAcknowledgement.create(
          {
            data: {
              datasetId: input.context.datasetId,
              wardId: input.context.wardId,
              handoffId: handoff.id,
              senderActorId: handoff.senderActorId,
              receiverActorId: handoff.receiverActorId,
              status: input.status,
              comment: input.comment,
              idempotencyRecordId: record.id,
              requestHash: input.requestHash,
              createdAt: input.now,
            },
            select: { id: true, status: true, createdAt: true },
          },
        );
        await transaction.handoffAuditEvent.create({
          data: {
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
            handoffId: handoff.id,
            senderActorId: handoff.senderActorId,
            receiverActorId: handoff.receiverActorId,
            actorId: input.context.actorId,
            eventType: input.status,
            acknowledgementId: acknowledgement.id,
            deduplicationKey: `acknowledgement:${acknowledgement.id}`,
            eventPayload: { status: input.status },
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
            resultReference: acknowledgement.id,
            updatedAt: input.now,
          },
        });
        if (completed.count !== 1)
          throw new IdempotencyInvariantViolationError();
        return {
          acknowledgementId: acknowledgement.id,
          status: acknowledgement.status,
          acknowledgedAt: acknowledgement.createdAt,
        };
      });
    } catch (error: unknown) {
      if (!hasPrismaErrorCode(error, 'P2002')) throw error;
      return this.replayAcknowledgement(input);
    }
  }

  async history(
    input: Parameters<HandoffActivityRepository['history']>[0],
  ): ReturnType<HandoffActivityRepository['history']> {
    return this.prisma.$transaction(async (transaction) => {
      const handoff = await transaction.handoff.findFirst({
        where: {
          id: input.handoffId,
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          OR: [
            { senderActorId: input.context.actorId },
            {
              receiverActorId: input.context.actorId,
              status: 'FINALIZED',
              finalSnapshot: { isNot: null },
            },
          ],
        },
        select: {
          id: true,
          senderActorId: true,
          receiverActorId: true,
          status: true,
        },
      });
      if (!handoff) throw new HandoffNotFoundError();
      await appendFirstHandoffView(transaction, {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        handoffId: handoff.id,
        senderActorId: handoff.senderActorId,
        receiverActorId: handoff.receiverActorId,
        actorId: input.context.actorId,
        viewedAt: input.viewedAt,
      });
      const rows = await transaction.handoffAuditEvent.findMany({
        where: {
          datasetId: input.context.datasetId,
          handoffId: handoff.id,
          ...(input.cursor === undefined
            ? {}
            : {
                OR: [
                  { occurredAt: { gt: input.cursor.occurredAt } },
                  {
                    occurredAt: input.cursor.occurredAt,
                    id: { gt: input.cursor.id },
                  },
                ],
              }),
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: input.limit + 1,
        select: {
          id: true,
          eventType: true,
          actorId: true,
          eventPayload: true,
          occurredAt: true,
        },
      });
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          eventId: row.id,
          type: toPublicEventType(row.eventType),
          actorId: row.actorId,
          occurredAt: row.occurredAt,
          metadata: toSafeMetadata(row.eventPayload),
        })),
        nextCursor:
          rows.length > input.limit && last
            ? encodeHandoffHistoryCursor({
                occurredAt: last.occurredAt,
                id: last.id,
              })
            : null,
      };
    });
  }

  private async replayAcknowledgement(
    input: CreateHandoffAcknowledgementCommand,
  ): Promise<CreatedHandoffAcknowledgement> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          operation: ACKNOWLEDGE_OPERATION,
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
    if (!record) throw new HandoffAcknowledgementDuplicateError();
    if (
      record.wardId !== input.context.wardId ||
      record.requestHash !== input.requestHash
    ) {
      throw new IdempotencyKeyReusedError();
    }
    if (record.status !== 'COMPLETED')
      throw new IdempotencyRequestInProgressError();
    if (!record.resultReference) throw new IdempotencyInvariantViolationError();
    const acknowledgement = await this.prisma.handoffAcknowledgement.findFirst({
      where: {
        id: record.resultReference,
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        handoffId: input.handoffId,
        receiverActorId: input.context.actorId,
        status: input.status,
      },
      select: { id: true, status: true, createdAt: true },
    });
    if (!acknowledgement) throw new IdempotencyInvariantViolationError();
    return {
      acknowledgementId: acknowledgement.id,
      status: acknowledgement.status,
      acknowledgedAt: acknowledgement.createdAt,
    };
  }
}

async function lockReceiverHandoff(
  transaction: Prisma.TransactionClient,
  input: CreateHandoffAcknowledgementCommand,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Handoff"
    WHERE "id" = ${input.handoffId}::uuid
      AND "datasetId" = ${input.context.datasetId}::uuid
      AND "wardId" = ${input.context.wardId}::uuid
      AND "receiverActorId" = ${input.context.actorId}::uuid
    FOR UPDATE
  `);
  return rows.length === 1;
}

function toPublicEventType(value: string): HandoffHistoryEventType {
  const map: Record<string, HandoffHistoryEventType> = {
    HANDOFF_CREATED: 'CREATED',
    GENERATION_RETRIED: 'GENERATION_RETRIED',
    DRAFT_GENERATED: 'DRAFT_GENERATED',
    DRAFT_UPDATED: 'DRAFT_UPDATED',
    FINALIZED: 'FINALIZED',
    FIRST_VIEWED: 'VIEWED',
    QUESTIONED: 'QUESTIONED',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
  };
  const result = map[value];
  if (!result) throw new IdempotencyInvariantViolationError();
  return result;
}

function toSafeMetadata(
  value: Prisma.JsonValue | null,
): HandoffHistoryMetadata {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
  const source = value as Record<string, Prisma.JsonValue>;
  const metadata: HandoffHistoryMetadata = {};
  if (typeof source.generationSequence === 'number')
    metadata.generationSequence = source.generationSequence;
  if (typeof source.version === 'number') metadata.version = source.version;
  if (
    source.unverifiedHandling === 'RESOLVED' ||
    source.unverifiedHandling === 'KEEP_WITH_WARNING'
  )
    metadata.unverifiedHandling = source.unverifiedHandling;
  if (source.status === 'QUESTIONED' || source.status === 'ACKNOWLEDGED')
    metadata.status = source.status;
  if (
    Array.isArray(source.warningItemIds) &&
    source.warningItemIds.every((item) => typeof item === 'string')
  )
    metadata.warningItemIds = source.warningItemIds;
  return metadata;
}

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
