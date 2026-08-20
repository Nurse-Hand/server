import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { MonthlyScheduleInvalidError } from '../domain/monthly-schedule.errors';
import {
  isYearMonth,
  normalizeScheduleEntries,
  type ScheduleEntryInput,
} from '../domain/monthly-schedule.policy';
import {
  MONTHLY_SCHEDULE_REPOSITORY,
  type MonthlyScheduleRepository,
  type MonthlyScheduleView,
  type SaveMonthlyScheduleResult,
} from './ports/monthly-schedule.repository';

type PutMonthlyScheduleCommand = {
  expectedVersion: number;
  entries: readonly ScheduleEntryInput[];
};

@Injectable()
export class MonthlyScheduleService {
  constructor(
    @Inject(MONTHLY_SCHEDULE_REPOSITORY)
    private readonly repository: MonthlyScheduleRepository,
  ) {}

  put(
    context: DemoSessionContext,
    yearMonth: string,
    idempotencyKey: string,
    command: PutMonthlyScheduleCommand,
  ): Promise<SaveMonthlyScheduleResult> {
    if (
      !Number.isInteger(command.expectedVersion) ||
      command.expectedVersion < 0 ||
      !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey)
    ) {
      throw new MonthlyScheduleInvalidError();
    }

    let entries: ScheduleEntryInput[];
    try {
      entries = normalizeScheduleEntries(yearMonth, command.entries);
    } catch {
      throw new MonthlyScheduleInvalidError();
    }

    return this.repository.save({
      context,
      yearMonth,
      expectedVersion: command.expectedVersion,
      entries,
      idempotencyKey,
      requestHash: createCanonicalRequestHash({
        path: { yearMonth },
        query: {},
        body: {
          entries,
          expectedVersion: command.expectedVersion,
        },
      }),
    });
  }

  find(
    context: DemoSessionContext,
    yearMonth: string,
  ): Promise<MonthlyScheduleView> {
    if (!isYearMonth(yearMonth)) {
      throw new MonthlyScheduleInvalidError();
    }

    return this.repository.find(context, yearMonth);
  }
}
