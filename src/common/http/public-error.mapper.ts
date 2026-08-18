import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ApplicationError,
  type ApplicationErrorKind,
} from '../errors/application.error';

export type PublicError = {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

const APPLICATION_ERROR_STATUS: Readonly<Record<ApplicationErrorKind, number>> =
  {
    BAD_REQUEST: HttpStatus.BAD_REQUEST,
    UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
    FORBIDDEN: HttpStatus.FORBIDDEN,
    NOT_FOUND: HttpStatus.NOT_FOUND,
    CONFLICT: HttpStatus.CONFLICT,
    UNPROCESSABLE_ENTITY: HttpStatus.UNPROCESSABLE_ENTITY,
    TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
    UPSTREAM_BAD_RESPONSE: HttpStatus.BAD_GATEWAY,
    DEPENDENCY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
    UPSTREAM_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  };

const DEFAULT_ERRORS: Readonly<Record<number, Omit<PublicError, 'status'>>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'BAD_REQUEST',
    message: '요청 값이 올바르지 않습니다.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'UNAUTHORIZED',
    message: '인증이 필요합니다.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'FORBIDDEN',
    message: '요청한 작업을 수행할 권한이 없습니다.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'ROUTE_NOT_FOUND',
    message: '요청한 경로를 찾을 수 없습니다.',
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: '현재 상태와 요청이 충돌합니다.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'UNPROCESSABLE_ENTITY',
    message: '요청을 현재 상태에서 처리할 수 없습니다.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'TOO_MANY_REQUESTS',
    message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  },
  [HttpStatus.BAD_GATEWAY]: {
    code: 'BAD_GATEWAY',
    message: '외부 서비스 응답을 처리할 수 없습니다.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: '서비스를 일시적으로 사용할 수 없습니다.',
  },
  [HttpStatus.GATEWAY_TIMEOUT]: {
    code: 'GATEWAY_TIMEOUT',
    message: '외부 서비스 응답 시간이 초과되었습니다.',
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    code: 'INTERNAL_SERVER_ERROR',
    message: '서버 오류가 발생했습니다.',
  },
};

export function mapExceptionToPublicError(exception: unknown): PublicError {
  if (exception instanceof ApplicationError) {
    return {
      status: APPLICATION_ERROR_STATUS[exception.kind],
      code: exception.code,
      message: exception.publicMessage,
      ...(exception.publicDetails === undefined
        ? {}
        : { details: exception.publicDetails }),
    };
  }

  if (!(exception instanceof HttpException)) {
    return defaultError(HttpStatus.INTERNAL_SERVER_ERROR);
  }

  const status = exception.getStatus();
  const exceptionResponse = exception.getResponse();

  if (
    status === HttpStatus.BAD_REQUEST &&
    typeof exceptionResponse === 'object' &&
    exceptionResponse !== null &&
    'message' in exceptionResponse &&
    Array.isArray(exceptionResponse.message)
  ) {
    return {
      ...defaultError(status),
      code: 'VALIDATION_FAILED',
      details: {
        messages: exceptionResponse.message.filter(
          (message): message is string => typeof message === 'string',
        ),
      },
    };
  }

  return defaultError(status);
}

function defaultError(status: number): PublicError {
  const defaultError =
    DEFAULT_ERRORS[status] ?? DEFAULT_ERRORS[HttpStatus.INTERNAL_SERVER_ERROR];

  return {
    status: DEFAULT_ERRORS[status] ? status : HttpStatus.INTERNAL_SERVER_ERROR,
    code: defaultError.code,
    message: defaultError.message,
  };
}
