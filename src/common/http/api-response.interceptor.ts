import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ensureRequestId, type RequestWithContext } from './request-context';

export type ApiSuccessResponse<T> = {
  data: T;
  meta: {
    requestId: string;
    page?: ApiPageMeta;
  };
};

export type ApiPageMeta = {
  nextCursor: string | null;
};

const PAGINATED_RESPONSE = Symbol('PAGINATED_RESPONSE');

export type PaginatedResponse<T> = {
  readonly [PAGINATED_RESPONSE]: true;
  readonly data: T;
  readonly page: ApiPageMeta;
};

export function paginatedResponse<T>(
  data: T,
  nextCursor: string | null,
): PaginatedResponse<T> {
  return {
    [PAGINATED_RESPONSE]: true,
    data,
    page: { nextCursor },
  };
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T> | undefined
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | undefined> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithContext>();
    const response = httpContext.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        if (response.statusCode === 204) {
          return undefined;
        }

        if (isPaginatedResponse(data)) {
          return {
            data: data.data,
            meta: {
              requestId: ensureRequestId(request),
              page: data.page,
            },
          };
        }

        return {
          data,
          meta: {
            requestId: ensureRequestId(request),
          },
        };
      }),
    );
  }
}

function isPaginatedResponse<T>(value: T): value is T & PaginatedResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    PAGINATED_RESPONSE in value &&
    value[PAGINATED_RESPONSE] === true
  );
}
