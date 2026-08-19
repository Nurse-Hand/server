import { ApplicationError } from '../../../common/errors/application.error';

export class TaskNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '업무 또는 업무 추출 결과를 찾을 수 없습니다.',
    });
    this.name = TaskNotFoundError.name;
  }
}

export class TaskCommandInvalidError extends ApplicationError {
  constructor(message = '업무 요청 값이 올바르지 않습니다.') {
    super({
      code: 'TASK_COMMAND_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: message,
    });
    this.name = TaskCommandInvalidError.name;
  }
}

export class TaskCursorInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_CURSOR_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: '업무 목록 cursor가 올바르지 않습니다.',
    });
    this.name = TaskCursorInvalidError.name;
  }
}

export class TaskDueAtInvalidError extends ApplicationError {
  constructor(message = '업무 마감 시각이 허용된 범위를 벗어났습니다.') {
    super({
      code: 'TASK_DUE_AT_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: message,
    });
    this.name = TaskDueAtInvalidError.name;
  }
}

export class TaskCurrentDutyUnresolvedError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_CURRENT_DUTY_UNRESOLVED',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '현재 근무를 하나로 결정할 수 없습니다.',
    });
    this.name = TaskCurrentDutyUnresolvedError.name;
  }
}

export class TaskCompletedImmutableError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_COMPLETED_IMMUTABLE',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '완료된 업무는 변경할 수 없습니다.',
    });
    this.name = TaskCompletedImmutableError.name;
  }
}

export class TaskExtractionEvidenceEmptyError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_EXTRACTION_EVIDENCE_EMPTY',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '업무를 추출할 수 있는 라운딩 근거가 없습니다.',
    });
    this.name = TaskExtractionEvidenceEmptyError.name;
  }
}

export class TaskExtractionEvidenceInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_EXTRACTION_EVIDENCE_INVALID',
      kind: 'UPSTREAM_BAD_RESPONSE',
      publicMessage: '라운딩 근거를 안전하게 처리할 수 없습니다.',
    });
    this.name = TaskExtractionEvidenceInvalidError.name;
  }
}

export class TaskExtractionNotSucceededError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_EXTRACTION_NOT_SUCCEEDED',
      kind: 'CONFLICT',
      publicMessage: '성공한 업무 추출 작업만 반영할 수 있습니다.',
    });
    this.name = TaskExtractionNotSucceededError.name;
  }
}

export class TaskCandidateAlreadyAppliedError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_CANDIDATE_ALREADY_APPLIED',
      kind: 'CONFLICT',
      publicMessage: '이미 반영된 업무 후보가 포함되어 있습니다.',
    });
    this.name = TaskCandidateAlreadyAppliedError.name;
  }
}

export class TaskApplyInvalidError extends ApplicationError {
  constructor(message = '업무 후보 반영 요청을 처리할 수 없습니다.') {
    super({
      code: 'TASK_APPLY_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: message,
    });
    this.name = TaskApplyInvalidError.name;
  }
}

export class TaskAiTimeoutError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_AI_TIMEOUT',
      kind: 'UPSTREAM_TIMEOUT',
      publicMessage: '업무 제안 처리 시간이 초과되었습니다.',
    });
    this.name = TaskAiTimeoutError.name;
  }
}

export class TaskAiResponseInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_AI_RESPONSE_INVALID',
      kind: 'UPSTREAM_BAD_RESPONSE',
      publicMessage: '업무 제안 응답을 안전하게 처리할 수 없습니다.',
    });
    this.name = TaskAiResponseInvalidError.name;
  }
}

export class TaskPersistenceInvariantError extends ApplicationError {
  constructor() {
    super({
      code: 'TASK_PERSISTENCE_INVARIANT_VIOLATION',
      kind: 'INTERNAL_ERROR',
      publicMessage: '업무 상태를 안전하게 저장할 수 없습니다.',
    });
    this.name = TaskPersistenceInvariantError.name;
  }
}
