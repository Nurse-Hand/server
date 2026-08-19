import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

export type RequestWithContext = Request & {
  requestId?: string;
};

export function ensureRequestId(request: RequestWithContext): string {
  request.requestId ??= randomUUID();
  return request.requestId;
}
