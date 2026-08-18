import { ApplicationError } from './application.error';

export const INITIAL_VERSION = 1;

export class VersionConflictError extends ApplicationError {
  constructor(expectedVersion: number, actualVersion?: number) {
    super({
      code: 'VERSION_CONFLICT',
      kind: 'CONFLICT',
      publicMessage:
        '다른 변경이 먼저 반영되었습니다. 최신 상태를 다시 조회해 주세요.',
      publicDetails: {
        expectedVersion,
        ...(actualVersion === undefined ? {} : { actualVersion }),
      },
    });
    this.name = VersionConflictError.name;
  }
}
