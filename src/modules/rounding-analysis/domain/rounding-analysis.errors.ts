import { ApplicationError } from '../../../common/errors/application.error';

export class RoundingAnalysisJobNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_ANALYSIS_JOB_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '라운딩 분석 작업을 찾을 수 없습니다.',
    });
    this.name = RoundingAnalysisJobNotFoundError.name;
  }
}

export class RoundingAnalysisSessionNotCompletedError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_ANALYSIS_SESSION_NOT_COMPLETED',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '전체 라운딩 종료 후 분석을 시작할 수 있습니다.',
    });
    this.name = RoundingAnalysisSessionNotCompletedError.name;
  }
}

export class RoundingAnalysisConfirmationInvalidError extends ApplicationError {
  constructor(message = '라운딩 분석 확인 요청이 올바르지 않습니다.') {
    super({
      code: 'ROUNDING_ANALYSIS_CONFIRMATION_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: message,
    });
    this.name = RoundingAnalysisConfirmationInvalidError.name;
  }
}
