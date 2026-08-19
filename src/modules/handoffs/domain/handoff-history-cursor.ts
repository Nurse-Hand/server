import { HandoffCursorInvalidError } from './handoff.errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type HandoffHistoryCursor = {
  occurredAt: Date;
  id: string;
};

export function encodeHandoffHistoryCursor(
  cursor: HandoffHistoryCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      occurredAt: cursor.occurredAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeHandoffHistoryCursor(
  value: string,
): HandoffHistoryCursor {
  try {
    if (!BASE64URL_PATTERN.test(value)) throw new TypeError();
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new TypeError();
    const parsed = JSON.parse(decoded.toString('utf8')) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('occurredAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.occurredAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !UUID_PATTERN.test(parsed.id)
    ) {
      throw new TypeError();
    }
    const occurredAt = new Date(parsed.occurredAt);
    if (
      Number.isNaN(occurredAt.getTime()) ||
      occurredAt.toISOString() !== parsed.occurredAt
    ) {
      throw new TypeError();
    }
    const cursor = { occurredAt, id: parsed.id };
    if (encodeHandoffHistoryCursor(cursor) !== value) throw new TypeError();
    return cursor;
  } catch {
    throw new HandoffCursorInvalidError();
  }
}
