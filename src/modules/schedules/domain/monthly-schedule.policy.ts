export const SCHEDULE_DUTIES = ['DAY', 'EVENING', 'NIGHT', 'OFF'] as const;

export type ScheduleDuty = (typeof SCHEDULE_DUTIES)[number];

export type ScheduleEntryInput = {
  date: string;
  duty: ScheduleDuty;
};

export function isYearMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function daysInYearMonth(yearMonth: string): number {
  if (!isYearMonth(yearMonth)) {
    throw new TypeError('올바른 yearMonth가 아닙니다.');
  }

  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function normalizeScheduleEntries(
  yearMonth: string,
  entries: readonly ScheduleEntryInput[],
): ScheduleEntryInput[] {
  if (!isYearMonth(yearMonth) || entries.length > daysInYearMonth(yearMonth)) {
    throw new TypeError('월별 근무표 날짜가 올바르지 않습니다.');
  }

  const normalized = entries
    .map((entry) => ({ date: entry.date, duty: entry.duty }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const dates = new Set<string>();

  for (const entry of normalized) {
    if (
      !entry.date.startsWith(`${yearMonth}-`) ||
      !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(entry.date) ||
      !SCHEDULE_DUTIES.includes(entry.duty) ||
      dates.has(entry.date)
    ) {
      throw new TypeError('월별 근무표 날짜가 올바르지 않습니다.');
    }

    const day = Number(entry.date.slice(8, 10));
    if (day > daysInYearMonth(yearMonth)) {
      throw new TypeError('월별 근무표 날짜가 올바르지 않습니다.');
    }

    dates.add(entry.date);
  }

  return normalized;
}
