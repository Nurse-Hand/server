import { ApplicationError } from '../errors/application.error';

export class IdempotencyRequestInProgressError extends ApplicationError {
  constructor() {
    super({
      code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      kind: 'CONFLICT',
      publicMessage: '같은 멱등성 요청이 처리 중입니다.',
    });
    this.name = IdempotencyRequestInProgressError.name;
  }
}

export class IdempotencyKeyReusedError extends ApplicationError {
  constructor() {
    super({
      code: 'IDEMPOTENCY_KEY_REUSED',
      kind: 'CONFLICT',
      publicMessage: '같은 멱등성 키를 다른 요청에 사용할 수 없습니다.',
    });
    this.name = IdempotencyKeyReusedError.name;
  }
}

export class IdempotencyInvariantViolationError extends ApplicationError {
  constructor() {
    super({
      code: 'IDEMPOTENCY_INVARIANT_VIOLATION',
      kind: 'INTERNAL_ERROR',
      publicMessage: '멱등성 요청 결과를 안전하게 복원할 수 없습니다.',
    });
    this.name = IdempotencyInvariantViolationError.name;
  }
}
