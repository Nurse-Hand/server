const SEOUL_OFFSET = '+09:00';
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function seoulDateRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00.000${SEOUL_OFFSET}`);

  if (Number.isNaN(from.getTime())) {
    throw new TypeError('유효한 Asia/Seoul 날짜가 아닙니다.');
  }

  return { from, to: new Date(from.getTime() + DAY_IN_MILLISECONDS) };
}

export function toSeoulDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
