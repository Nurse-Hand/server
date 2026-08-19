import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type {
  ScheduleDuty,
  ScheduleEntryInput,
} from '../../domain/monthly-schedule.policy';

export const MONTHLY_SCHEDULE_REPOSITORY = Symbol(
  'MONTHLY_SCHEDULE_REPOSITORY',
);

export type MonthlyScheduleView = {
  yearMonth: string;
  version: number;
  entries: readonly ScheduleEntryInput[];
  totals: Readonly<Record<ScheduleDuty, number>>;
};

export type SaveMonthlyScheduleInput = {
  context: DemoSessionContext;
  yearMonth: string;
  expectedVersion: number;
  entries: readonly ScheduleEntryInput[];
  idempotencyKey: string;
  requestHash: string;
};

export type SaveMonthlyScheduleResult = {
  schedule: MonthlyScheduleView;
  isReplay: boolean;
};

export interface MonthlyScheduleRepository {
  save(input: SaveMonthlyScheduleInput): Promise<SaveMonthlyScheduleResult>;
  find(
    context: DemoSessionContext,
    yearMonth: string,
  ): Promise<MonthlyScheduleView>;
}
