import { ApplicationError } from '../../../common/errors/application.error';

export class AiJobClaimLostError extends ApplicationError {
  constructor() {
    super({
      code: 'AI_JOB_CLAIM_LOST',
      kind: 'CONFLICT',
      publicMessage:
        'AI 작업 lease가 만료되었거나 다른 worker가 인계받았습니다.',
    });
    this.name = AiJobClaimLostError.name;
  }
}

export class AiJobCommandInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'AI_JOB_COMMAND_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: 'AI 작업 명령이 올바르지 않습니다.',
    });
    this.name = AiJobCommandInvalidError.name;
  }
}

export class AiJobInvariantViolationError extends ApplicationError {
  constructor() {
    super({
      code: 'AI_JOB_INVARIANT_VIOLATION',
      kind: 'INTERNAL_ERROR',
      publicMessage: 'AI 작업 상태를 안전하게 변경할 수 없습니다.',
    });
    this.name = AiJobInvariantViolationError.name;
  }
}

export class AiJobScopeInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'AI_JOB_SCOPE_INVALID',
      kind: 'NOT_FOUND',
      publicMessage: 'AI 작업 범위를 찾을 수 없습니다.',
    });
    this.name = AiJobScopeInvalidError.name;
  }
}
