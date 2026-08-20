import { ApplicationError } from '../../../common/errors/application.error';

export class PatientNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'PATIENT_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '환자를 찾을 수 없습니다.',
    });
    this.name = PatientNotFoundError.name;
  }
}

export class PatientTimelineQueryInvalidError extends ApplicationError {
  constructor(message = '환자 Timeline 조회 조건이 올바르지 않습니다.') {
    super({
      code: 'PATIENT_TIMELINE_QUERY_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: message,
    });
    this.name = PatientTimelineQueryInvalidError.name;
  }
}
