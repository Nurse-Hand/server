import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationError } from '../errors/application.error';
import { ensureRequestId, type RequestWithContext } from './request-context';
import { mapExceptionToPublicError } from './public-error.mapper';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<RequestWithContext>();
    const response = httpContext.getResponse<Response>();
    const publicError = mapExceptionToPublicError(exception);
    const requestId = ensureRequestId(request);

    if (publicError.status >= 500) {
      this.logger.error({
        code: publicError.code,
        exceptionType: this.getExceptionType(exception),
        requestId,
        status: publicError.status,
      });
    }

    response.status(publicError.status).json({
      error: {
        code: publicError.code,
        message: publicError.message,
        ...(publicError.details === undefined
          ? {}
          : { details: publicError.details }),
      },
      meta: { requestId },
    });
  }

  private getExceptionType(exception: unknown): string {
    if (exception instanceof ApplicationError) {
      return ApplicationError.name;
    }

    if (exception instanceof HttpException) {
      return HttpException.name;
    }

    return exception instanceof Error ? exception.name : 'UnknownError';
  }
}
