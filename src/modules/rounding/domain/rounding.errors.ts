import { ApplicationError } from '../../../common/errors/application.error';

export class RoundingSessionNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_SESSION_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '라운딩 세션을 찾을 수 없습니다.',
    });
    this.name = RoundingSessionNotFoundError.name;
  }
}

export class RoundingSessionAlreadyCompletedError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_SESSION_ALREADY_COMPLETED',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '이미 종료된 라운딩 세션입니다.',
    });
    this.name = RoundingSessionAlreadyCompletedError.name;
  }
}

export class RoundingSegmentPeriodInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_SEGMENT_PERIOD_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '환자 라운딩 구간 시간이 올바르지 않습니다.',
    });
    this.name = RoundingSegmentPeriodInvalidError.name;
  }
}

export class RoundingRecordPeriodInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_RECORD_PERIOD_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '라운딩 기록 시간이 올바르지 않습니다.',
    });
    this.name = RoundingRecordPeriodInvalidError.name;
  }
}

export class RoundingSessionCompletedAtInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_SESSION_COMPLETED_AT_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '라운딩 종료 시각이 시작 시각보다 이를 수 없습니다.',
    });
    this.name = RoundingSessionCompletedAtInvalidError.name;
  }
}

export class RoundingPatientNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_PATIENT_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '라운딩 대상 환자를 찾을 수 없습니다.',
    });
    this.name = RoundingPatientNotFoundError.name;
  }
}

export class RoundingRecordPayloadRequiredError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_RECORD_PAYLOAD_REQUIRED',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '빠른 기록에는 메모 또는 음성 파일이 필요합니다.',
    });
    this.name = RoundingRecordPayloadRequiredError.name;
  }
}

export class RoundingAudioFileNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'ROUNDING_AUDIO_FILE_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '연결할 음성 파일을 찾을 수 없습니다.',
    });
    this.name = RoundingAudioFileNotFoundError.name;
  }
}
