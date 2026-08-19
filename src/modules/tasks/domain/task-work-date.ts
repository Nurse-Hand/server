import { TaskCommandInvalidError } from './task.errors';

const SEOUL_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function deriveSeoulWorkDate(dueAt: Date): Date {
  const local = new Date(dueAt.getTime() + SEOUL_OFFSET_MILLISECONDS);
  return parseTaskWorkDate(local.toISOString().slice(0, 10));
}

export function parseTaskWorkDate(value: string): Date {
  const match = DATE_PATTERN.exec(value);

  if (!match) {
    throw new TaskCommandInvalidError('date는 YYYY-MM-DD 형식이어야 합니다.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new TaskCommandInvalidError('date가 유효한 날짜가 아닙니다.');
  }

  return parsed;
}

export function formatTaskWorkDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
