import { Injectable } from '@nestjs/common';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
  IdempotencyRequestInProgressError,
} from '../../../common/idempotency/idempotency.errors';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  MonthlyScheduleRepository,
  MonthlyScheduleView,
  SaveMonthlyScheduleInput,
  SaveMonthlyScheduleResult,
} from '../application/ports/monthly-schedule.repository';
import { MonthlyScheduleNotFoundError } from '../domain/monthly-schedule.errors';
import {
  normalizeScheduleEntries,
  SCHEDULE_DUTIES,
  type ScheduleDuty,
  type ScheduleEntryInput,
} from '../domain/monthly-schedule.policy';

const MONTHLY_SCHEDULE_SAVE_OPERATION = 'monthly-schedules.put';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

type IdempotencyRow = {
  id: string;
  requestHash: string;
  resultReference: string | null;
  status: 'PROCESSING' | 'COMPLETED';
  wardId: string;
};

@Injectable()
export class PrismaMonthlyScheduleRepository implements MonthlyScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    input: SaveMonthlyScheduleInput,
  ): Promise<SaveMonthlyScheduleResult> {
    const replay = await this.findReplay(this.prisma, input);
    if (replay !== null) {
      return replay;
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const transactionReplay = await this.findReplay(transaction, input);
        if (transactionReplay !== null) {
          return transactionReplay;
        }

        const idempotencyRecord = await transaction.idempotencyRecord.create({
          data: {
            ...input.context,
            operation: MONTHLY_SCHEDULE_SAVE_OPERATION,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
          },
          select: { id: true },
        });

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
        if (current === null) {
          if (input.expectedVersion !== 0) {
            throw new VersionConflictError(input.expectedVersion, 0);
          }

          const created = await transaction.monthlySchedule.create({
            data: {
              ...input.context,
              yearMonth: input.yearMonth,
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
            where: {
              id: current.id,
              datasetId: input.context.datasetId,
              actorId: input.context.actorId,
              wardId: input.context.wardId,
              version: input.expectedVersion,
            },
            data: { version: { increment: 1 } },
          });
          if (updated.count !== 1) {
            throw new VersionConflictError(input.expectedVersion);
          }

          scheduleId = current.id;
          await transaction.monthlyScheduleEntry.deleteMany({
            where: {
              datasetId: input.context.datasetId,
              scheduleId,
            },
          });
        }

        if (input.entries.length > 0) {
          await transaction.monthlyScheduleEntry.createMany({
            data: input.entries.map((entry) => ({
              datasetId: input.context.datasetId,
              scheduleId,
              dutyDate: new Date(`${entry.date}T00:00:00.000Z`),
              duty: entry.duty,
            })),
          });
        }

        const schedule = await this.readStoredSchedule(
          transaction,
          input.context,
          input.yearMonth,
          scheduleId,
        );

        await transaction.monthlyScheduleReceipt.create({
          data: {
            ...input.context,
            operation: MONTHLY_SCHEDULE_SAVE_OPERATION,
            idempotencyRecordId: idempotencyRecord.id,
            scheduleId,
            responseSnapshot: serializeMonthlySchedule(schedule.view),
          },
        });
        const completed = await transaction.idempotencyRecord.updateMany({
          where: {
            id: idempotencyRecord.id,
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            operation: MONTHLY_SCHEDULE_SAVE_OPERATION,
            status: 'PROCESSING',
          },
          data: {
            status: 'COMPLETED',
            resultReference: scheduleId,
          },
        });
        if (completed.count !== 1) {
          throw new IdempotencyInvariantViolationError();
        }

        return { schedule: schedule.view, isReplay: false };
      });
    } catch (error: unknown) {
      if (!hasPrismaErrorCode(error, 'P2002')) {
        throw error;
      }

      const concurrentReplay = await this.findReplay(this.prisma, input);
      if (concurrentReplay !== null) {
        return concurrentReplay;
      }

      const concurrentSchedule = await this.prisma.monthlySchedule.findUnique({
        where: {
          monthly_schedule_scope_month: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            yearMonth: input.yearMonth,
          },
        },
        select: { version: true },
      });
      if (concurrentSchedule !== null) {
        throw new VersionConflictError(
          input.expectedVersion,
          concurrentSchedule.version,
        );
      }

      throw error;
    }
  }

  async find(
    context: DemoSessionContext,
    yearMonth: string,
  ): Promise<MonthlyScheduleView> {
    return (await this.readStoredSchedule(this.prisma, context, yearMonth))
      .view;
  }

  private async findReplay(
    client: DatabaseClient,
    input: SaveMonthlyScheduleInput,
  ): Promise<SaveMonthlyScheduleResult | null> {
    const record = await client.idempotencyRecord.findUnique({
      where: {
        idempotency_scope_key: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          operation: MONTHLY_SCHEDULE_SAVE_OPERATION,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        id: true,
        requestHash: true,
        resultReference: true,
        status: true,
        wardId: true,
      },
    });
    if (record === null) {
      return null;
    }

    return this.resolveReplay(client, input, record);
  }

  private async resolveReplay(
    client: DatabaseClient,
    input: SaveMonthlyScheduleInput,
    record: IdempotencyRow,
  ): Promise<SaveMonthlyScheduleResult> {
    if (
      record.requestHash !== input.requestHash ||
      record.wardId !== input.context.wardId
    ) {
      throw new IdempotencyKeyReusedError();
    }
    if (record.status === 'PROCESSING') {
      throw new IdempotencyRequestInProgressError();
    }

    const receipt = await client.monthlyScheduleReceipt.findFirst({
      where: {
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        operation: MONTHLY_SCHEDULE_SAVE_OPERATION,
        idempotencyRecordId: record.id,
      },
      select: { scheduleId: true, responseSnapshot: true },
    });
    if (receipt === null || record.resultReference !== receipt.scheduleId) {
      throw new IdempotencyInvariantViolationError();
    }

    return {
      schedule: deserializeMonthlySchedule(receipt.responseSnapshot),
      isReplay: true,
    };
  }

  private async readStoredSchedule(
    client: DatabaseClient,
    context: DemoSessionContext,
    yearMonth: string,
    scheduleId?: string,
  ): Promise<{ id: string; view: MonthlyScheduleView }> {
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
        version: true,
        entries: {
          orderBy: { dutyDate: 'asc' },
          select: { dutyDate: true, duty: true },
        },
      },
    });
    if (row === null) {
      throw new MonthlyScheduleNotFoundError();
    }

    const entries = row.entries.map((entry) => ({
      date: entry.dutyDate.toISOString().slice(0, 10),
      duty: entry.duty,
    }));
    return {
      id: row.id,
      view: {
        yearMonth: row.yearMonth,
        version: row.version,
        entries,
        totals: countDuties(entries),
      },
    };
  }
}

function countDuties(
  entries: readonly ScheduleEntryInput[],
): Record<ScheduleDuty, number> {
  const totals: Record<ScheduleDuty, number> = {
    DAY: 0,
    EVENING: 0,
    NIGHT: 0,
    OFF: 0,
  };
  for (const entry of entries) {
    totals[entry.duty] += 1;
  }
  return totals;
}

function serializeMonthlySchedule(
  schedule: MonthlyScheduleView,
): Prisma.InputJsonObject {
  return {
    yearMonth: schedule.yearMonth,
    version: schedule.version,
    entries: schedule.entries.map((entry) => ({ ...entry })),
    totals: { ...schedule.totals },
  };
}

function deserializeMonthlySchedule(
  value: Prisma.JsonValue,
): MonthlyScheduleView {
  if (
    !isJsonObject(value) ||
    typeof value.yearMonth !== 'string' ||
    !Number.isInteger(value.version) ||
    (value.version as number) < 1 ||
    !Array.isArray(value.entries) ||
    !isJsonObject(value.totals)
  ) {
    throw new IdempotencyInvariantViolationError();
  }

  const rawEntries: ScheduleEntryInput[] = [];
  for (const entry of value.entries) {
    if (
      !isJsonObject(entry) ||
      typeof entry.date !== 'string' ||
      typeof entry.duty !== 'string' ||
      !SCHEDULE_DUTIES.includes(entry.duty as ScheduleDuty)
    ) {
      throw new IdempotencyInvariantViolationError();
    }
    rawEntries.push({
      date: entry.date,
      duty: entry.duty as ScheduleDuty,
    });
  }

  let entries: ScheduleEntryInput[];
  try {
    entries = normalizeScheduleEntries(value.yearMonth, rawEntries);
  } catch {
    throw new IdempotencyInvariantViolationError();
  }
  const totals = countDuties(entries);
  const storedTotals = value.totals;
  if (SCHEDULE_DUTIES.some((duty) => storedTotals[duty] !== totals[duty])) {
    throw new IdempotencyInvariantViolationError();
  }

  return {
    yearMonth: value.yearMonth,
    version: value.version as number,
    entries,
    totals,
  };
}

function isJsonObject(value: unknown): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
