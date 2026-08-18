import { createCanonicalRequestHash } from './canonical-request-hash';

describe('createCanonicalRequestHash', () => {
  it('object key 순서와 무관하게 같은 SHA-256 hash를 만든다', () => {
    const first = createCanonicalRequestHash({
      path: { patientId: 'patient-a' },
      query: { cursor: 'cursor-a', filters: { b: 2, a: 1 } },
      body: { items: [{ z: true, a: null }] },
    });
    const second = createCanonicalRequestHash({
      body: { items: [{ a: null, z: true }] },
      query: { filters: { a: 1, b: 2 }, cursor: 'cursor-a' },
      path: { patientId: 'patient-a' },
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('array 순서와 path/query/body 값 변경을 구분한다', () => {
    const base = {
      path: {},
      query: {},
      body: { selectedIds: ['a', 'b'] },
    };

    expect(createCanonicalRequestHash(base)).not.toBe(
      createCanonicalRequestHash({
        ...base,
        body: { selectedIds: ['b', 'a'] },
      }),
    );
  });

  it('header나 requestId를 입력 계약에 포함하지 않는다', () => {
    const parts = {
      path: {},
      query: {},
      body: { value: 'validated' },
    };

    expect(Object.keys(parts).sort()).toEqual(['body', 'path', 'query']);
  });

  it('JSON으로 안정적으로 표현할 수 없는 값을 거부한다', () => {
    expect(() =>
      createCanonicalRequestHash({
        path: {},
        query: {},
        body: { invalid: Number.NaN },
      }),
    ).toThrow('유한한 숫자');
  });
});
