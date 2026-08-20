const SEOUL_UTC_OFFSET_HOURS = 9;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export function deriveRoundingWorkDate(timestamp: Date): Date {
  const shifted = new Date(
    timestamp.getTime() + SEOUL_UTC_OFFSET_HOURS * 60 * 60 * 1000,
  );
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();

  return parseRoundingWorkDate(
    `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
  );
}

export function parseRoundingWorkDate(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatRoundingWorkDate(value: Date): string {
  const aligned = new Date(
    Math.floor(value.getTime() / MILLIS_PER_DAY) * MILLIS_PER_DAY,
  );
  const year = aligned.getUTCFullYear();
  const month = aligned.getUTCMonth() + 1;
  const day = aligned.getUTCDate();

  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
