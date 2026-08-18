import {
  INITIAL_VERSION,
  VersionConflictError,
} from './version-conflict.error';

describe('VersionConflictError', () => {
  it('공통 version은 1에서 시작한다', () => {
    expect(INITIAL_VERSION).toBe(1);
  });

  it('공개 가능한 version 충돌 정보만 포함한다', () => {
    const error = new VersionConflictError(2, 3);

    expect(error).toMatchObject({
      code: 'VERSION_CONFLICT',
      kind: 'CONFLICT',
      publicDetails: { expectedVersion: 2, actualVersion: 3 },
    });
  });
});
