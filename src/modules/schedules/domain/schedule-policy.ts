export const SCHEDULE_OCR_OPERATION = 'SCHEDULE_OCR';
export const SCHEDULE_OCR_RESULT_TTL_MS = 24 * 60 * 60 * 1_000;
export const SCHEDULE_OCR_ORPHAN_TTL_MS = 60 * 60 * 1_000;
export const SCHEDULE_OCR_MAX_FILE_BYTES = 10 * 1_024 * 1_024;
export const SCHEDULE_OCR_MIN_DIMENSION = 320;
export const SCHEDULE_OCR_MAX_DIMENSION = 12_000;
export const SCHEDULE_OCR_MAX_PIXEL_AREA = 4_000_000;
export const SCHEDULE_OCR_SUPPORTED_TEMPLATES = [
  'FIXED_V1',
  'FIXED_V2',
] as const;

export const SCHEDULE_OCR_ALLOWED_ROWS: Readonly<
  Record<(typeof SCHEDULE_OCR_SUPPORTED_TEMPLATES)[number], readonly number[]>
> = {
  FIXED_V1: [2],
  FIXED_V2: [2],
};
export const SCHEDULE_DUTIES = ['DAY', 'EVENING', 'NIGHT', 'OFF'] as const;
export const SCHEDULE_OCR_TOKENS = ['D', 'E', 'N', 'OFF', 'UNKNOWN'] as const;

export type ScheduleDuty = (typeof SCHEDULE_DUTIES)[number];
export type ScheduleOcrToken = (typeof SCHEDULE_OCR_TOKENS)[number];

export function isYearMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function daysInYearMonth(yearMonth: string): number {
  if (!isYearMonth(yearMonth))
    throw new TypeError('올바른 yearMonth가 아닙니다.');
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function normalizeOcrToken(token: string): ScheduleOcrToken {
  const normalized = token.trim().toUpperCase();
  return SCHEDULE_OCR_TOKENS.includes(normalized as ScheduleOcrToken)
    ? (normalized as ScheduleOcrToken)
    : 'UNKNOWN';
}

export function needsOcrReview(
  token: ScheduleOcrToken,
  confidence: number,
): boolean {
  return token === 'UNKNOWN' || confidence < 0.85;
}

export type ScheduleEntryInput = { date: string; duty: ScheduleDuty };

export function normalizeScheduleEntries(
  yearMonth: string,
  entries: readonly ScheduleEntryInput[],
): ScheduleEntryInput[] {
  if (!isYearMonth(yearMonth) || entries.length > daysInYearMonth(yearMonth)) {
    throw new TypeError('월별 근무표 날짜가 올바르지 않습니다.');
  }
  const normalized = [...entries].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
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
