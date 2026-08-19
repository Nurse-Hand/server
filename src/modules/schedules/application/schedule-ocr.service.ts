import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { IdempotentAiJobService } from '../../ai-jobs/application/idempotent-ai-job.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { UploadedFilePayload } from '../../files/application/uploaded-file';
import {
  ScheduleOcrJobNotFoundError,
  ScheduleOcrRequestInvalidError,
  ScheduleOcrResultExpiredError,
} from '../domain/schedule.errors';
import { validateScheduleImage } from '../domain/schedule-image-policy';
import {
  daysInYearMonth,
  isYearMonth,
  needsOcrReview,
  SCHEDULE_OCR_OPERATION,
  SCHEDULE_OCR_ORPHAN_TTL_MS,
  SCHEDULE_OCR_RESULT_TTL_MS,
  SCHEDULE_OCR_SUPPORTED_TEMPLATES,
  type ScheduleOcrToken,
} from '../domain/schedule-policy';
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
  failure: { code: string; retryable: boolean } | null;
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
    private readonly jobs: IdempotentAiJobService,
    private readonly clock: Clock,
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
      !Number.isInteger(input.rowIndex) ||
      input.rowIndex < 0 ||
      input.rowIndex > 200 ||
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
    const storageUri = await this.storage.store(
      input.file.buffer,
      image.extension,
    );
    const reservation = await this.jobs
      .reserve({
        ...input.context,
        operation: SCHEDULE_OCR_OPERATION,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        requestId: input.requestId,
        maxAttempts: 3,
      })
      .catch(async (error: unknown) => {
        await this.storage.delete(storageUri);
        throw error;
      });

    if (reservation.isReplay) {
      await this.storage.delete(storageUri);
      return { jobId: reservation.jobId, status: 'QUEUED', isReplay: true };
    }

    await this.prisma.scheduleOcrJob.create({
      data: {
        aiJobId: reservation.jobId,
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        yearMonth: input.yearMonth,
        templateId: input.templateId,
        rowIndex: input.rowIndex,
        fileHash,
        storageUri,
        imageWidth: image.width,
        imageHeight: image.height,
      },
    });

    await this.process({
      ...input,
      file: input.file,
      jobId: reservation.jobId,
      storageUri,
    });
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
    return this.storage.sweepOrphans(
      new Date(this.clock.now().getTime() - SCHEDULE_OCR_ORPHAN_TTL_MS),
    );
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
      const now = this.clock.now();
      await this.prisma.$transaction(async (transaction) => {
        await transaction.scheduleOcrCell.createMany({
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
        const job = await transaction.aiJob.update({
          where: { id: input.jobId },
          data: {
            status: 'SUCCEEDED',
            resultReference: input.jobId,
            version: { increment: 1 },
            updatedAt: now,
          },
          select: { idempotencyRecordId: true },
        });
        await transaction.idempotencyRecord.update({
          where: { id: job.idempotencyRecordId },
          data: {
            status: 'COMPLETED',
            resultReference: input.jobId,
            updatedAt: now,
          },
        });
        await transaction.scheduleOcrJob.update({
          where: { aiJobId: input.jobId },
          data: {
            storageUri: null,
            resultExpiresAt: new Date(
              now.getTime() + SCHEDULE_OCR_RESULT_TTL_MS,
            ),
          },
        });
      });
    } catch {
      const now = this.clock.now();
      await this.prisma.$transaction(async (transaction) => {
        const job = await transaction.aiJob.update({
          where: { id: input.jobId },
          data: {
            status: 'FAILED',
            failureCode: 'SCHEDULE_OCR_FAILED',
            retryable: false,
            version: { increment: 1 },
            updatedAt: now,
          },
          select: { idempotencyRecordId: true },
        });
        await transaction.idempotencyRecord.update({
          where: { id: job.idempotencyRecordId },
          data: {
            status: 'COMPLETED',
            resultReference: input.jobId,
            updatedAt: now,
          },
        });
        await transaction.scheduleOcrJob.update({
          where: { aiJobId: input.jobId },
          data: { storageUri: null },
        });
      });
    } finally {
      await this.storage.delete(input.storageUri);
    }
  }
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
