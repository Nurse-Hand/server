import { Injectable } from '@nestjs/common';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { IdempotencyKeyReusedError } from '../../../common/idempotency/idempotency.errors';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  MonthlyScheduleInvalidError,
  MonthlyScheduleNotFoundError,
  ScheduleOcrJobNotFoundError,
  ScheduleOcrResultExpiredError,
} from '../domain/schedule.errors';
import {
  normalizeScheduleEntries,
  type ScheduleDuty,
  type ScheduleEntryInput,
} from '../domain/schedule-policy';

export type MonthlyScheduleReadModel = {
  id: string;
  yearMonth: string;
  sourceJobId: string | null;
  version: number;
  entries: ScheduleEntryInput[];
  totals: Record<ScheduleDuty, number>;
};

@Injectable()
export class MonthlyScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async put(input: {
    context: DemoSessionContext;
    yearMonth: string;
    sourceJobId: string | null;
    expectedVersion: number;
    entries: ScheduleEntryInput[];
    idempotencyKey: string;
  }): Promise<MonthlyScheduleReadModel> {
    let entries: ScheduleEntryInput[];
    try {
      entries = normalizeScheduleEntries(input.yearMonth, input.entries);
    } catch {
      throw new MonthlyScheduleInvalidError();
    }
    if (
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      input.idempotencyKey.length < 1 ||
      input.idempotencyKey.length > 128
    ) {
      throw new MonthlyScheduleInvalidError();
    }
    const requestHash = createCanonicalRequestHash({
      path: { yearMonth: input.yearMonth },
      query: {},
      body: {
        entries,
        expectedVersion: input.expectedVersion,
        sourceJobId: input.sourceJobId,
      },
    });

    const replay = await this.findReplay(input, requestHash);
    if (replay) return replay;

    return this.prisma.$transaction(async (transaction) => {
      if (input.sourceJobId !== null) {
        const source = await transaction.scheduleOcrJob.findFirst({
          where: {
            aiJobId: input.sourceJobId,
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            yearMonth: input.yearMonth,
            aiJob: { status: 'SUCCEEDED' },
          },
          select: { resultExpiresAt: true },
        });
        if (!source) throw new ScheduleOcrJobNotFoundError();
        if (
          source.resultExpiresAt !== null &&
          source.resultExpiresAt <= this.clock.now()
        ) {
          throw new ScheduleOcrResultExpiredError();
        }
      }

      const current = await transaction.monthlySchedule.findUnique({
        where: {
          monthly_schedule_scope_month: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            yearMonth: input.yearMonth,
          },
        },
        select: { id: true, version: true },
      });
      let scheduleId: string;
      if (!current) {
        if (input.expectedVersion !== 0) {
          throw new VersionConflictError(input.expectedVersion, 0);
        }
        const created = await transaction.monthlySchedule.create({
          data: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            yearMonth: input.yearMonth,
            sourceJobId: input.sourceJobId,
          },
          select: { id: true },
        });
        scheduleId = created.id;
      } else {
        if (current.version !== input.expectedVersion) {
          throw new VersionConflictError(
            input.expectedVersion,
            current.version,
          );
        }
        const updated = await transaction.monthlySchedule.updateMany({
          where: { id: current.id, version: input.expectedVersion },
          data: {
            sourceJobId: input.sourceJobId,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new VersionConflictError(input.expectedVersion);
        }
        scheduleId = current.id;
        await transaction.monthlyScheduleEntry.deleteMany({
          where: { scheduleId },
        });
      }
      await transaction.monthlyScheduleEntry.createMany({
        data: entries.map((entry) => ({
          scheduleId,
          dutyDate: new Date(`${entry.date}T00:00:00.000Z`),
          duty: entry.duty,
        })),
      });
      await transaction.scheduleSaveRequest.create({
        data: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          yearMonth: input.yearMonth,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          scheduleId,
        },
      });
      return this.readWithClient(transaction, input.context, input.yearMonth);
    });
  }

  read(
    context: DemoSessionContext,
    yearMonth: string,
  ): Promise<MonthlyScheduleReadModel> {
    return this.readWithClient(this.prisma, context, yearMonth);
  }

  private async findReplay(
    input: {
      context: DemoSessionContext;
      yearMonth: string;
      idempotencyKey: string;
    },
    requestHash: string,
  ): Promise<MonthlyScheduleReadModel | null> {
    const replay = await this.prisma.scheduleSaveRequest.findUnique({
      where: {
        schedule_save_scope_key: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          yearMonth: input.yearMonth,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { requestHash: true, scheduleId: true, wardId: true },
    });
    if (!replay) return null;
    if (
      replay.requestHash !== requestHash ||
      replay.wardId !== input.context.wardId
    ) {
      throw new IdempotencyKeyReusedError();
    }
    return this.readWithClient(
      this.prisma,
      input.context,
      input.yearMonth,
      replay.scheduleId,
    );
  }

  private async readWithClient(
    client: Pick<PrismaService, 'monthlySchedule'>,
    context: DemoSessionContext,
    yearMonth: string,
    scheduleId?: string,
  ): Promise<MonthlyScheduleReadModel> {
    const row = await client.monthlySchedule.findFirst({
      where: {
        ...(scheduleId === undefined ? {} : { id: scheduleId }),
        datasetId: context.datasetId,
        actorId: context.actorId,
        wardId: context.wardId,
        yearMonth,
      },
      select: {
        id: true,
        yearMonth: true,
        sourceJobId: true,
        version: true,
        entries: {
          orderBy: { dutyDate: 'asc' },
          select: { dutyDate: true, duty: true },
        },
      },
    });
    if (!row) throw new MonthlyScheduleNotFoundError();
    const totals: Record<ScheduleDuty, number> = {
      DAY: 0,
      EVENING: 0,
      NIGHT: 0,
      OFF: 0,
    };
    const entries = row.entries.map((entry) => {
      totals[entry.duty] += 1;
      return {
        date: entry.dutyDate.toISOString().slice(0, 10),
        duty: entry.duty,
      };
    });
    return {
      id: row.id,
      yearMonth: row.yearMonth,
      sourceJobId: row.sourceJobId,
      version: row.version,
      entries,
      totals,
    };
  }
}
