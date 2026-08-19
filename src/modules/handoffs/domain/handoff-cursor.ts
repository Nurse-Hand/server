import { HandoffCursorInvalidError } from './handoff.errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type HandoffCursor = {
  updatedAt: Date;
  id: string;
};

export function encodeHandoffCursor(cursor: HandoffCursor): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeHandoffCursor(value: string): HandoffCursor {
  try {
    if (!BASE64URL_PATTERN.test(value)) {
      throw new TypeError();
    }
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
      throw new TypeError();
    }
    const parsed = JSON.parse(decoded.toString('utf8')) as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('updatedAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.updatedAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !UUID_PATTERN.test(parsed.id)
    ) {
      throw new TypeError();
    }

    const updatedAt = new Date(parsed.updatedAt);
    if (
      Number.isNaN(updatedAt.getTime()) ||
      updatedAt.toISOString() !== parsed.updatedAt
    ) {
      throw new TypeError();
    }

    return { updatedAt, id: parsed.id };
  } catch {
    throw new HandoffCursorInvalidError();
  }
}
