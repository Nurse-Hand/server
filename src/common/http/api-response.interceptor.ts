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
  };
};

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
