import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
} from '../../../common/idempotency/idempotency.errors';
import { Prisma } from '../../../generated/prisma/client';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { UploadedFilePayload } from '../../files/application/uploaded-file';
import {
  ScheduleOcrJobNotFoundError,
  ScheduleOcrEngineUnavailableError,
  ScheduleOcrRequestInvalidError,
  ScheduleOcrResultExpiredError,
} from '../domain/schedule.errors';
import { validateScheduleImage } from '../domain/schedule-image-policy';
import {
  daysInYearMonth,
  isYearMonth,
  needsOcrReview,
  SCHEDULE_OCR_ALLOWED_ROWS,
  SCHEDULE_OCR_OPERATION,
  SCHEDULE_OCR_ORPHAN_TTL_MS,
  SCHEDULE_OCR_RESULT_TTL_MS,
  SCHEDULE_OCR_SUPPORTED_TEMPLATES,
  type ScheduleOcrToken,
} from '../domain/schedule-policy';
import { isAllowedSyntheticScheduleFixture } from '../domain/synthetic-schedule-fixture-registry';
import {
  SCHEDULE_OCR_GATEWAY,
  type ScheduleOcrGateway,
} from './ports/schedule-ocr.gateway';
import {
  SCHEDULE_OCR_STORAGE,
  type ScheduleOcrStorage,
} from './ports/schedule-ocr-storage.port';

export type ScheduleOcrJobReadModel = {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  yearMonth: string;
  templateId: string;
  rowIndex: number;
  failure: { code: string; retryable: boolean; message: string } | null;
  resultExpiresAt: Date | null;
  candidates: Array<{
    date: string;
    token: ScheduleOcrToken;
    confidence: number;
    needsReview: boolean;
  }>;
};

@Injectable()
export class ScheduleOcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly config: ConfigService,
    @Inject(SCHEDULE_OCR_GATEWAY)
    private readonly gateway: ScheduleOcrGateway,
    @Inject(SCHEDULE_OCR_STORAGE)
    private readonly storage: ScheduleOcrStorage,
  ) {}

  async create(input: {
    context: DemoSessionContext;
    file: UploadedFilePayload | undefined;
    yearMonth: string;
    templateId: string;
    rowIndex: number;
    idempotencyKey: string;
    requestId: string;
  }): Promise<{ jobId: string; status: 'QUEUED'; isReplay: boolean }> {
    if (
      !input.file ||
      !isYearMonth(input.yearMonth) ||
      !SCHEDULE_OCR_SUPPORTED_TEMPLATES.includes(
        input.templateId as (typeof SCHEDULE_OCR_SUPPORTED_TEMPLATES)[number],
      ) ||
      !SCHEDULE_OCR_ALLOWED_ROWS[
        input.templateId as keyof typeof SCHEDULE_OCR_ALLOWED_ROWS
      ]?.includes(input.rowIndex) ||
      input.idempotencyKey.length < 1 ||
      input.idempotencyKey.length > 128
    ) {
      throw new ScheduleOcrRequestInvalidError();
    }

    const image = validateScheduleImage({
      buffer: input.file.buffer,
      mimeType: input.file.mimetype,
      originalName: input.file.originalname,
      sizeBytes: input.file.buffer.length,
    });
    const fileHash = createHash('sha256')
      .update(input.file.buffer)
      .digest('hex');
    const requestHash = createCanonicalRequestHash({
      path: {},
      query: {},
      body: {
        fileHash,
        rowIndex: input.rowIndex,
        templateId: input.templateId,
        yearMonth: input.yearMonth,
      },
    });
    const isAllowedFixture =
      this.config.get<boolean>('DEMO_MODE') === true &&
      isAllowedSyntheticScheduleFixture({
        fileHash,
        templateId: input.templateId,
        rowIndex: input.rowIndex,
        width: image.width,
        height: image.height,
      });
    const proposedJobId = randomUUID();
    const storageUri = isAllowedFixture
      ? this.storage.resolveStorageUri(proposedJobId, image.extension)
      : null;
    const reservation = await this.reserve({
      ...input,
      fileHash,
      requestHash,
      storageUri,
      imageWidth: image.width,
      imageHeight: image.height,
      isAllowedFixture,
      proposedJobId,
    });

    if (reservation.isReplay) {
      return { jobId: reservation.jobId, status: 'QUEUED', isReplay: true };
    }

    if (isAllowedFixture && storageUri !== null) {
      try {
        await this.storage.store(storageUri, input.file.buffer);
      } catch {
        await this.finalizeAfterCleanup(reservation.jobId, storageUri, {
          status: 'FAILED',
          failureCode: 'SCHEDULE_OCR_STORAGE_FAILED',
          retryable: true,
          resultExpiresAt: null,
        });
        return { jobId: reservation.jobId, status: 'QUEUED', isReplay: false };
      }
      await this.process({
        ...input,
        file: input.file,
        jobId: reservation.jobId,
        storageUri,
      });
    }
    return { jobId: reservation.jobId, status: 'QUEUED', isReplay: false };
  }

  async get(
    context: DemoSessionContext,
    jobId: string,
  ): Promise<ScheduleOcrJobReadModel> {
    const row = await this.prisma.scheduleOcrJob.findFirst({
      where: {
        aiJobId: jobId,
        datasetId: context.datasetId,
        actorId: context.actorId,
        wardId: context.wardId,
      },
      select: {
        aiJobId: true,
        yearMonth: true,
        templateId: true,
        rowIndex: true,
        resultExpiresAt: true,
        aiJob: { select: { status: true, failureCode: true, retryable: true } },
        cells: {
          orderBy: { dutyDate: 'asc' },
          select: {
            dutyDate: true,
            token: true,
            confidence: true,
            needsReview: true,
          },
        },
      },
    });
    if (!row) throw new ScheduleOcrJobNotFoundError();
    if (
      row.aiJob.status === 'SUCCEEDED' &&
      row.resultExpiresAt &&
      row.resultExpiresAt <= this.clock.now()
    ) {
      throw new ScheduleOcrResultExpiredError();
    }
    return {
      jobId: row.aiJobId,
      status: row.aiJob.status,
      yearMonth: row.yearMonth,
      templateId: row.templateId,
      rowIndex: row.rowIndex,
      failure:
        row.aiJob.failureCode === null
          ? null
          : {
              code: row.aiJob.failureCode,
              retryable: row.aiJob.retryable ?? false,
              message:
                row.aiJob.failureCode === 'SCHEDULE_OCR_ENGINE_UNAVAILABLE'
                  ? '이 이미지는 DEMO OCR 대상이 아닙니다. 수동으로 근무표를 등록해 주세요.'
                  : 'OCR 후보를 만들 수 없습니다. 수동으로 근무표를 등록해 주세요.',
            },
      resultExpiresAt: row.resultExpiresAt,
      candidates: row.cells.map((cell) => ({
        date: cell.dutyDate.toISOString().slice(0, 10),
        token: cell.token,
        confidence: Number(cell.confidence),
        needsReview: cell.needsReview,
      })),
    };
  }

  cleanupOrphans(): Promise<number> {
    return this.retryPendingCleanup();
  }

  async retryPendingCleanup(limit = 20): Promise<number> {
    const pending = await this.prisma.scheduleOcrJob.findMany({
      where: {
        storageUri: { not: null },
        updatedAt: {
          lte: new Date(
            this.clock.now().getTime() - SCHEDULE_OCR_ORPHAN_TTL_MS,
          ),
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        aiJobId: true,
        storageUri: true,
        cleanupPendingStatus: true,
        cleanupPendingFailureCode: true,
        cleanupPendingRetryable: true,
        cleanupPendingResultExpiresAt: true,
        aiJob: { select: { failureCode: true, retryable: true } },
        _count: { select: { cells: true } },
      },
    });
    let completed = 0;
    for (const item of pending) {
      if (item.storageUri === null) continue;
      const fallbackSucceeded = item._count.cells > 0;
      try {
        await this.finalizeAfterCleanup(item.aiJobId, item.storageUri, {
          status: (item.cleanupPendingStatus ??
            (fallbackSucceeded ? 'SUCCEEDED' : 'FAILED')) as
            'SUCCEEDED' | 'FAILED',
          failureCode:
            item.cleanupPendingStatus !== null
              ? item.cleanupPendingFailureCode
              : fallbackSucceeded
                ? null
                : (item.aiJob.failureCode ?? 'SCHEDULE_OCR_INTERRUPTED'),
          retryable:
            item.cleanupPendingStatus !== null
              ? item.cleanupPendingRetryable
              : fallbackSucceeded
                ? null
                : (item.aiJob.retryable ?? true),
          resultExpiresAt:
            item.cleanupPendingResultExpiresAt ??
            (fallbackSucceeded
              ? new Date(
                  this.clock.now().getTime() + SCHEDULE_OCR_RESULT_TTL_MS,
                )
              : null),
        });
        completed += 1;
      } catch {
        // 다음 실행에서 다시 시도한다. URI나 내부 오류는 공개하지 않는다.
      }
    }
    return completed;
  }

  private async finalizeAfterCleanup(
    jobId: string,
    storageUri: string,
    outcome: {
      status: 'SUCCEEDED' | 'FAILED';
      failureCode: string | null;
      retryable: boolean | null;
      resultExpiresAt: Date | null;
    },
  ): Promise<void> {
    try {
      await this.storage.delete(storageUri);
    } catch (error: unknown) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.aiJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            failureCode: 'SCHEDULE_OCR_CLEANUP_FAILED',
            retryable: true,
            resultReference: null,
            version: { increment: 1 },
            updatedAt: this.clock.now(),
          },
        });
        await transaction.scheduleOcrJob.update({
          where: { aiJobId: jobId },
          data: {
            cleanupPendingStatus: outcome.status,
            cleanupPendingFailureCode: outcome.failureCode,
            cleanupPendingRetryable: outcome.retryable,
            cleanupPendingResultExpiresAt: outcome.resultExpiresAt,
          },
        });
      });
      throw error;
    }

    const now = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const job = await transaction.aiJob.update({
        where: { id: jobId },
        data: {
          status: outcome.status,
          failureCode: outcome.failureCode,
          retryable: outcome.retryable,
          resultReference: outcome.status === 'SUCCEEDED' ? jobId : null,
          version: { increment: 1 },
          updatedAt: now,
        },
        select: { idempotencyRecordId: true },
      });
      await transaction.idempotencyRecord.update({
        where: { id: job.idempotencyRecordId },
        data: { status: 'COMPLETED', resultReference: jobId, updatedAt: now },
      });
      await transaction.scheduleOcrJob.update({
        where: { aiJobId: jobId },
        data: {
          storageUri: null,
          resultExpiresAt: outcome.resultExpiresAt,
          cleanupPendingStatus: null,
          cleanupPendingFailureCode: null,
          cleanupPendingRetryable: null,
          cleanupPendingResultExpiresAt: null,
        },
      });
    });
  }

  private async recordPendingOutcome(
    jobId: string,
    outcome: {
      status: 'SUCCEEDED' | 'FAILED';
      failureCode: string | null;
      retryable: boolean | null;
      resultExpiresAt: Date | null;
    },
  ): Promise<void> {
    await this.prisma.scheduleOcrJob.update({
      where: { aiJobId: jobId },
      data: {
        cleanupPendingStatus: outcome.status,
        cleanupPendingFailureCode: outcome.failureCode,
        cleanupPendingRetryable: outcome.retryable,
        cleanupPendingResultExpiresAt: outcome.resultExpiresAt,
      },
    });
  }

  private async reserve(input: {
    context: DemoSessionContext;
    yearMonth: string;
    templateId: string;
    rowIndex: number;
    idempotencyKey: string;
    requestId: string;
    fileHash: string;
    requestHash: string;
    storageUri: string | null;
    imageWidth: number;
    imageHeight: number;
    isAllowedFixture: boolean;
    proposedJobId: string;
  }): Promise<{ jobId: string; isReplay: boolean }> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await this.findReservation(transaction, input);
        if (existing) return existing;

        const idempotencyRecordId = randomUUID();
        const jobId = input.proposedJobId;
        await transaction.idempotencyRecord.create({
          data: {
            id: idempotencyRecordId,
            ...input.context,
            operation: SCHEDULE_OCR_OPERATION,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            status: input.isAllowedFixture ? 'PROCESSING' : 'COMPLETED',
            resultReference: input.isAllowedFixture ? null : jobId,
          },
        });
        await transaction.aiJob.create({
          data: {
            id: jobId,
            ...input.context,
            operation: SCHEDULE_OCR_OPERATION,
            idempotencyRecordId,
            requestId: input.requestId,
            maxAttempts: 3,
            status: input.isAllowedFixture ? 'QUEUED' : 'FAILED',
            failureCode: input.isAllowedFixture
              ? null
              : 'SCHEDULE_OCR_ENGINE_UNAVAILABLE',
            retryable: input.isAllowedFixture ? null : false,
            resultReference: input.isAllowedFixture ? null : jobId,
          },
        });
        await transaction.scheduleOcrJob.create({
          data: {
            aiJobId: jobId,
            ...input.context,
            yearMonth: input.yearMonth,
            templateId: input.templateId,
            rowIndex: input.rowIndex,
            fileHash: input.fileHash,
            storageUri: input.storageUri,
            imageWidth: input.imageWidth,
            imageHeight: input.imageHeight,
          },
        });
        return { jobId, isReplay: false };
      });
    } catch (error: unknown) {
      if (!hasPrismaErrorCode(error, 'P2002')) throw error;
      const existing = await this.findReservation(this.prisma, input);
      if (!existing) throw error;
      return existing;
    }
  }

  private async findReservation(
    client: Prisma.TransactionClient | PrismaService,
    input: {
      context: DemoSessionContext;
      idempotencyKey: string;
      requestHash: string;
    },
  ): Promise<{ jobId: string; isReplay: true } | null> {
    const existing = await client.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          operation: SCHEDULE_OCR_OPERATION,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        wardId: true,
        requestHash: true,
        aiJob: { select: { id: true } },
      },
    });
    if (!existing) return null;
    if (
      existing.wardId !== input.context.wardId ||
      existing.requestHash !== input.requestHash
    ) {
      throw new IdempotencyKeyReusedError();
    }
    if (!existing.aiJob) throw new IdempotencyInvariantViolationError();
    return { jobId: existing.aiJob.id, isReplay: true };
  }

  private async process(input: {
    context: DemoSessionContext;
    file: UploadedFilePayload;
    yearMonth: string;
    templateId: string;
    rowIndex: number;
    requestId: string;
    jobId: string;
    storageUri: string;
  }): Promise<void> {
    let outcome: {
      status: 'SUCCEEDED' | 'FAILED';
      failureCode: string | null;
      retryable: boolean | null;
      resultExpiresAt: Date | null;
    };
    try {
      await this.prisma.aiJob.update({
        where: { id: input.jobId },
        data: {
          status: 'PROCESSING',
          attempt: { increment: 1 },
          version: { increment: 1 },
          updatedAt: this.clock.now(),
        },
      });
      const candidates = await this.gateway.recognize({
        image: input.file.buffer,
        yearMonth: input.yearMonth,
        templateId: input.templateId,
        rowIndex: input.rowIndex,
        requestId: input.requestId,
      });
      assertCandidates(input.yearMonth, candidates);
      await this.prisma.scheduleOcrCell.createMany({
        data: candidates.map((candidate) => ({
          aiJobId: input.jobId,
          dutyDate: new Date(
            `${input.yearMonth}-${String(candidate.day).padStart(2, '0')}T00:00:00.000Z`,
          ),
          token: candidate.token,
          confidence: candidate.confidence,
          needsReview: needsOcrReview(candidate.token, candidate.confidence),
        })),
      });
      outcome = {
        status: 'SUCCEEDED',
        failureCode: null,
        retryable: null,
        resultExpiresAt: new Date(
          this.clock.now().getTime() + SCHEDULE_OCR_RESULT_TTL_MS,
        ),
      };
    } catch (error: unknown) {
      outcome = {
        status: 'FAILED',
        failureCode:
          error instanceof ScheduleOcrEngineUnavailableError
            ? 'SCHEDULE_OCR_ENGINE_UNAVAILABLE'
            : 'SCHEDULE_OCR_FAILED',
        retryable: false,
        resultExpiresAt: null,
      };
    }
    await this.recordPendingOutcome(input.jobId, outcome);
    await this.finalizeAfterCleanup(input.jobId, input.storageUri, outcome);
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

function assertCandidates(
  yearMonth: string,
  candidates: Array<{
    day: number;
    token: ScheduleOcrToken;
    confidence: number;
  }>,
): void {
  const days = daysInYearMonth(yearMonth);
  const uniqueDays = new Set(candidates.map(({ day }) => day));
  if (
    candidates.length !== days ||
    uniqueDays.size !== days ||
    candidates.some(
      ({ day, confidence }) =>
        !Number.isInteger(day) ||
        day < 1 ||
        day > days ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1,
    )
  ) {
    throw new TypeError('OCR 후보 결과가 계약을 만족하지 않습니다.');
  }
}
