import { ApplicationError } from '../../../common/errors/application.error';

export class ScheduleOcrFileInvalidError extends ApplicationError {
  constructor(code = 'SCHEDULE_OCR_FILE_INVALID') {
    super({
      code,
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: 'JPEG 또는 PNG 근무표 이미지를 확인해 주세요.',
    });
  }
}

export class ScheduleOcrRequestInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'SCHEDULE_OCR_REQUEST_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '근무표 OCR 요청 값을 확인해 주세요.',
    });
  }
}

export class ScheduleOcrJobNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'SCHEDULE_OCR_JOB_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: 'OCR 작업을 찾을 수 없습니다.',
    });
  }
}

export class ScheduleOcrResultExpiredError extends ApplicationError {
  constructor() {
    super({
      code: 'SCHEDULE_OCR_RESULT_EXPIRED',
      kind: 'GONE',
      publicMessage: 'OCR 후보 결과가 만료되었습니다.',
    });
  }
}
