import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  AiJobClaim,
  AiJobRepository,
  AiJobReservationResult,
  ClaimAiJobInput,
  FinishAiJobInput,
  ReserveAiJobInput,
} from '../application/ports/ai-job.repository';
import {
  AiJobInvariantViolationError,
  AiJobScopeInvalidError,
} from '../domain/ai-job.errors';

type ClaimedAiJobRow = {
  id: string;
  datasetId: string;
  actorId: string;
  wardId: string;
  operation: string;
  requestId: string;
  attempt: number;
  maxAttempts: number;
  leaseVersion: number;
  claimedAt: Date;
  leaseExpiresAt: Date;
};

type ExhaustedJobResult = {
  exhaustedCount: number;
  completedCount: number;
};

@Injectable()
export class PrismaAiJobRepository implements AiJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: ReserveAiJobInput): Promise<AiJobReservationResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findReservation(transaction, input);

        if (existing) {
          return existing;
        }

        const record = await transaction.idempotencyRecord.create({
          data: {
            datasetId: input.datasetId,
            actorId: input.actorId,
            wardId: input.wardId,
            operation: input.operation,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          },
          select: { id: true },
        });

        const job = await transaction.aiJob.create({
          data: {
            datasetId: input.datasetId,
            actorId: input.actorId,
            wardId: input.wardId,
            operation: input.operation,
            idempotencyRecordId: record.id,
            requestId: input.requestId,
            maxAttempts: input.maxAttempts,
          },
          select: { id: true },
        });

        return { kind: 'CREATED' as const, jobId: job.id };
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2003')) {
        throw new AiJobScopeInvalidError();
      }

      if (!hasPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const existing = await this.findReservation(this.prisma, input);

      if (!existing) {
        throw error;
      }

      return existing;
    }
  }

  async claimNext(input: ClaimAiJobInput): Promise<AiJobClaim | null> {
    const rows = await this.prisma.$transaction(async (transaction) => {
      const exhausted = await transaction.$queryRaw<ExhaustedJobResult[]>`
        WITH exhausted AS (
          UPDATE "AiJob"
          SET
            "status" = 'FAILED',
            "failureCode" = 'AI_JOB_MAX_ATTEMPTS_EXCEEDED',
            "retryable" = false,
            "resultReference" = NULL,
            "version" = "version" + 1,
            "updatedAt" = ${input.claimedAt}
          WHERE "datasetId" = ${input.datasetId}::uuid
            AND "wardId" = ${input.wardId}::uuid
            AND "operation" = ${input.operation}
            AND "status" = 'PROCESSING'
            AND "leaseExpiresAt" <= ${input.claimedAt}
            AND "attempt" >= "maxAttempts"
          RETURNING "id", "datasetId", "idempotencyRecordId"
        ),
        completed AS (
          UPDATE "IdempotencyRecord" AS record
          SET
            "status" = 'COMPLETED',
            "resultReference" = exhausted."id"::text,
            "updatedAt" = ${input.claimedAt}
          FROM exhausted
          WHERE record."datasetId" = exhausted."datasetId"
            AND record."id" = exhausted."idempotencyRecordId"
            AND record."status" = 'PROCESSING'
          RETURNING record."id"
        )
        SELECT
          (SELECT COUNT(*) FROM exhausted)::integer AS "exhaustedCount",
          (SELECT COUNT(*) FROM completed)::integer AS "completedCount"
      `;

      if (exhausted[0]?.exhaustedCount !== exhausted[0]?.completedCount) {
        throw new AiJobInvariantViolationError();
      }

      return transaction.$queryRaw<ClaimedAiJobRow[]>(Prisma.sql`
        WITH candidate AS (
          SELECT "id"
          FROM "AiJob"
          WHERE "datasetId" = ${input.datasetId}::uuid
            AND "wardId" = ${input.wardId}::uuid
            AND "operation" = ${input.operation}
            AND "attempt" < "maxAttempts"
            AND (
              "status" = 'QUEUED'
              OR (
                "status" = 'PROCESSING'
                AND "leaseExpiresAt" <= ${input.claimedAt}
              )
            )
          ORDER BY "createdAt" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "AiJob" AS job
        SET
          "status" = 'PROCESSING',
          "attempt" = job."attempt" + 1,
          "claimedAt" = ${input.claimedAt},
          "leaseExpiresAt" = ${input.leaseExpiresAt},
          "leaseVersion" = job."leaseVersion" + 1,
          "failureCode" = NULL,
          "retryable" = NULL,
          "resultReference" = NULL,
          "version" = job."version" + 1,
          "updatedAt" = ${input.claimedAt}
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING
          job."id",
          job."datasetId",
          job."actorId",
          job."wardId",
          job."operation",
          job."requestId",
          job."attempt",
          job."maxAttempts",
          job."leaseVersion",
          job."claimedAt",
          job."leaseExpiresAt"
      `);
    });
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      jobId: row.id,
      datasetId: row.datasetId,
      actorId: row.actorId,
      wardId: row.wardId,
      operation: row.operation,
      requestId: row.requestId,
      attempt: row.attempt,
      maxAttempts: row.maxAttempts,
      leaseVersion: row.leaseVersion,
      claimedAt: row.claimedAt,
      leaseExpiresAt: row.leaseExpiresAt,
    };
  }

  complete(
    input: FinishAiJobInput & { resultReference: string },
  ): Promise<boolean> {
    return this.finish(input, {
      status: 'SUCCEEDED',
      resultReference: input.resultReference,
      failureCode: null,
      retryable: null,
    });
  }

  fail(
    input: FinishAiJobInput & { failureCode: string; retryable: boolean },
  ): Promise<boolean> {
    return this.finish(input, {
      status: 'FAILED',
      resultReference: null,
      failureCode: input.failureCode,
      retryable: input.retryable,
    });
  }

  private async finish(
    input: FinishAiJobInput,
    terminal: {
      status: 'SUCCEEDED' | 'FAILED';
      resultReference: string | null;
      failureCode: string | null;
      retryable: boolean | null;
    },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const target = await transaction.aiJob.findFirst({
        where: {
          id: input.jobId,
          datasetId: input.datasetId,
          status: 'PROCESSING',
          leaseVersion: input.leaseVersion,
          leaseExpiresAt: { gt: input.now },
        },
        select: { idempotencyRecordId: true },
      });

      if (!target) {
        return false;
      }

      const updated = await transaction.aiJob.updateMany({
        where: {
          id: input.jobId,
          datasetId: input.datasetId,
          status: 'PROCESSING',
          leaseVersion: input.leaseVersion,
          leaseExpiresAt: { gt: input.now },
        },
        data: {
          status: terminal.status,
          resultReference: terminal.resultReference,
          failureCode: terminal.failureCode,
          retryable: terminal.retryable,
          version: { increment: 1 },
          updatedAt: input.now,
        },
      });

      if (updated.count !== 1) {
        return false;
      }

      const idempotency = await transaction.idempotencyRecord.updateMany({
        where: {
          id: target.idempotencyRecordId,
          datasetId: input.datasetId,
          status: 'PROCESSING',
        },
        data: {
          status: 'COMPLETED',
          resultReference: input.jobId,
          updatedAt: input.now,
        },
      });

      if (idempotency.count !== 1) {
        throw new AiJobInvariantViolationError();
      }

      return true;
    });
  }

  private async findReservation(
    client: Prisma.TransactionClient | PrismaService,
    input: ReserveAiJobInput,
  ): Promise<Extract<AiJobReservationResult, { kind: 'EXISTING' }> | null> {
    const record = await client.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: input.datasetId,
          actorId: input.actorId,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        wardId: true,
        requestHash: true,
        status: true,
        resultReference: true,
        aiJob: { select: { id: true } },
      },
    });

    return record
      ? {
          kind: 'EXISTING',
          jobId: record.aiJob?.id ?? null,
          wardId: record.wardId,
          requestHash: record.requestHash,
          status: record.status,
          resultReference: record.resultReference,
        }
      : null;
  }
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
