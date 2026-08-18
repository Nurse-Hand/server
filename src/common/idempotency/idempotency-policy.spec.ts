import {
  IdempotencyInvariantViolationError,
  IdempotencyKeyReusedError,
  IdempotencyRequestInProgressError,
} from './idempotency.errors';
import { resolveCompletedIdempotencyRecord } from './idempotency-policy';

const EXPECTED = { wardId: 'ward-a', requestHash: 'a'.repeat(64) };

describe('resolveCompletedIdempotencyRecord', () => {
  it.each([
    { wardId: 'ward-b', requestHash: EXPECTED.requestHash },
    { wardId: EXPECTED.wardId, requestHash: 'b'.repeat(64) },
  ])('ward 또는 request hash 재사용을 거부한다', (record) => {
    expect(() =>
      resolveCompletedIdempotencyRecord(EXPECTED, {
        ...record,
        status: 'COMPLETED',
        resultReference: 'result-1',
      }),
    ).toThrow(IdempotencyKeyReusedError);
  });

  it('동일 요청이 처리 중이면 안정된 conflict를 반환한다', () => {
    expect(() =>
      resolveCompletedIdempotencyRecord(EXPECTED, {
        ...EXPECTED,
        status: 'PROCESSING',
        resultReference: null,
      }),
    ).toThrow(IdempotencyRequestInProgressError);
  });

  it('완료된 공통 record의 resultReference를 반환한다', () => {
    expect(
      resolveCompletedIdempotencyRecord(EXPECTED, {
        ...EXPECTED,
        status: 'COMPLETED',
        resultReference: 'result-1',
      }),
    ).toBe('result-1');
  });

  it('완료 record에 resultReference가 없으면 invariant 오류를 낸다', () => {
    expect(() =>
      resolveCompletedIdempotencyRecord(EXPECTED, {
        ...EXPECTED,
        status: 'COMPLETED',
        resultReference: null,
      }),
    ).toThrow(IdempotencyInvariantViolationError);
  });
});
