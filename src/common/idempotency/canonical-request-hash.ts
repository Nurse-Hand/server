import { createHash } from 'node:crypto';

export type CanonicalJsonPrimitive = boolean | number | string | null;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };
export type CanonicalJsonObject = { [key: string]: CanonicalJsonValue };

export type CanonicalRequestParts = {
  path: CanonicalJsonObject;
  query: CanonicalJsonObject;
  body: CanonicalJsonObject;
};

export function createCanonicalRequestHash(
  requestParts: CanonicalRequestParts,
): string {
  const canonicalRequest = canonicalize({
    body: requestParts.body,
    path: requestParts.path,
    query: requestParts.query,
  });

  return createHash('sha256')
    .update(JSON.stringify(canonicalRequest), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): CanonicalJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        'Canonical request에는 유한한 숫자만 사용할 수 있습니다.',
      );
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (!isPlainObject(value)) {
    throw new TypeError(
      'Canonical request에는 JSON object, array, primitive만 사용할 수 있습니다.',
    );
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}
