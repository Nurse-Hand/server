import { ApplicationError } from '../../../common/errors/application.error';

export class MonthlyScheduleInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'MONTHLY_SCHEDULE_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '월별 근무표의 날짜 또는 근무 유형이 올바르지 않습니다.',
    });
    this.name = MonthlyScheduleInvalidError.name;
  }
}

export class MonthlyScheduleNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'MONTHLY_SCHEDULE_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '등록된 월별 근무표를 찾을 수 없습니다.',
    });
    this.name = MonthlyScheduleNotFoundError.name;
  }
}
