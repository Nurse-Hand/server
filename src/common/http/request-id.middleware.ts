import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { NextFunction, Response } from 'express';
import type { RequestWithContext } from './request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: RequestWithContext,
    response: Response,
    next: NextFunction,
  ): void {
    const header = request.headers['x-request-id'];
    const candidate = Array.isArray(header) ? header[0] : header;
    const requestId =
      typeof candidate === 'string' && isUUID(candidate)
        ? candidate
        : randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
