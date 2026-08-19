import { ApplicationError } from '../../../common/errors/application.error';

export class DemoSessionRequiredError extends ApplicationError {
  constructor() {
    super({
      code: 'DEMO_SESSION_REQUIRED',
      kind: 'UNAUTHORIZED',
      publicMessage: '데모 세션이 필요합니다.',
    });
    this.name = DemoSessionRequiredError.name;
  }
}

export class DemoSessionInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'DEMO_SESSION_INVALID',
      kind: 'UNAUTHORIZED',
      publicMessage: '데모 세션이 올바르지 않습니다.',
    });
    this.name = DemoSessionInvalidError.name;
  }
}

export class DemoSessionExpiredError extends ApplicationError {
  constructor() {
    super({
      code: 'DEMO_SESSION_EXPIRED',
      kind: 'UNAUTHORIZED',
      publicMessage: '데모 세션이 만료되었습니다.',
    });
    this.name = DemoSessionExpiredError.name;
  }
}

export class DemoScenarioNotAllowedError extends ApplicationError {
  constructor() {
    super({
      code: 'DEMO_SCENARIO_NOT_ALLOWED',
      kind: 'BAD_REQUEST',
      publicMessage: '지원하지 않는 데모 시나리오입니다.',
    });
    this.name = DemoScenarioNotAllowedError.name;
  }
}
