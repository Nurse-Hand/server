import { ApplicationError } from '../../../common/errors/application.error';

export class HandoffCommandInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_COMMAND_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: '인수인계 요청 값이 올바르지 않습니다.',
    });
    this.name = HandoffCommandInvalidError.name;
  }
}

export class HandoffNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '인수인계를 찾을 수 없습니다.',
    });
    this.name = HandoffNotFoundError.name;
  }
}

export class HandoffPrecheckNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_PRECHECK_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '인수인계 사전검증을 찾을 수 없습니다.',
    });
    this.name = HandoffPrecheckNotFoundError.name;
  }
}

export class HandoffShiftNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_SHIFT_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '인수인계 근무 정보를 찾을 수 없습니다.',
    });
    this.name = HandoffShiftNotFoundError.name;
  }
}

export class HandoffReceiverNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_RECEIVER_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '수신 근무자를 찾을 수 없습니다.',
    });
    this.name = HandoffReceiverNotFoundError.name;
  }
}

export class HandoffReceiverAmbiguousError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_RECEIVER_AMBIGUOUS',
      kind: 'CONFLICT',
      publicMessage: '수신 근무자를 하나로 결정할 수 없습니다.',
    });
    this.name = HandoffReceiverAmbiguousError.name;
  }
}

export class HandoffStateInvalidError extends ApplicationError {
  constructor(message = '현재 인수인계 상태에서는 요청을 처리할 수 없습니다.') {
    super({
      code: 'HANDOFF_STATE_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: message,
    });
    this.name = HandoffStateInvalidError.name;
  }
}

export class HandoffGenerationConflictError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_GENERATION_CONFLICT',
      kind: 'CONFLICT',
      publicMessage: '현재 사전검증으로 초안을 다시 생성할 수 없습니다.',
    });
    this.name = HandoffGenerationConflictError.name;
  }
}

export class HandoffPrecheckLockedError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_PRECHECK_LOCKED',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '초안 생성에 사용된 사전검증 답변은 변경할 수 없습니다.',
    });
    this.name = HandoffPrecheckLockedError.name;
  }
}

export class HandoffCriticalAnswerRequiredError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_CRITICAL_ANSWER_REQUIRED',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '필수 사전검증 항목에 모두 답변해야 합니다.',
    });
    this.name = HandoffCriticalAnswerRequiredError.name;
  }
}

export class HandoffUnverifiedPolicyInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_UNVERIFIED_POLICY_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '저장된 사전검증 답변과 확정 옵션이 일치하지 않습니다.',
    });
    this.name = HandoffUnverifiedPolicyInvalidError.name;
  }
}

export class HandoffTaskLinkInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_TASK_LINK_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '현재 범위의 미완료 업무만 인수인계에 연결할 수 있습니다.',
    });
    this.name = HandoffTaskLinkInvalidError.name;
  }
}

export class HandoffAcknowledgementTransitionError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_ACKNOWLEDGEMENT_TRANSITION_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '수신 확인 상태를 요청한 방향으로 변경할 수 없습니다.',
    });
    this.name = HandoffAcknowledgementTransitionError.name;
  }
}

export class HandoffAcknowledgementDuplicateError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_ACKNOWLEDGEMENT_DUPLICATE',
      kind: 'CONFLICT',
      publicMessage: '같은 수신 확인 상태가 이미 기록되었습니다.',
    });
    this.name = HandoffAcknowledgementDuplicateError.name;
  }
}

export class HandoffAiResultInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_AI_RESULT_INVALID',
      kind: 'UPSTREAM_BAD_RESPONSE',
      publicMessage: 'AI 결과를 안전하게 처리할 수 없습니다.',
    });
    this.name = HandoffAiResultInvalidError.name;
  }
}

export class HandoffJobClaimLostError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_JOB_CLAIM_LOST',
      kind: 'CONFLICT',
      publicMessage: '작업 처리 권한이 만료되었습니다.',
    });
    this.name = HandoffJobClaimLostError.name;
  }
}

export class HandoffCursorInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'HANDOFF_CURSOR_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: '목록 cursor가 올바르지 않습니다.',
    });
    this.name = HandoffCursorInvalidError.name;
  }
}
