import { ApplicationError } from '../../../common/errors/application.error';

export class PatientTimelineNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'PATIENT_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '환자를 찾을 수 없습니다.',
    });
    this.name = PatientTimelineNotFoundError.name;
  }
}

export class TimelinePeriodInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'TIMELINE_PERIOD_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: 'Timeline 조회 기간이 올바르지 않습니다.',
    });
    this.name = TimelinePeriodInvalidError.name;
  }
}

export class TimelineEventNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'TIMELINE_EVENT_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: 'Timeline 이벤트를 찾을 수 없습니다.',
    });
    this.name = TimelineEventNotFoundError.name;
  }
}

export class TimelineEventUpdateInvalidError extends ApplicationError {
  constructor(message: string) {
    super({
      code: 'TIMELINE_EVENT_UPDATE_INVALID',
      kind: 'BAD_REQUEST',
      publicMessage: message,
    });
    this.name = TimelineEventUpdateInvalidError.name;
  }
}
