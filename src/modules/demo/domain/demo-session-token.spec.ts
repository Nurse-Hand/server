import {
  createDemoSessionToken,
  digestDemoSessionToken,
} from './demo-session-token';

describe('demo session token', () => {
  it('256-bit 이상의 예측 불가능한 opaque token을 생성한다', () => {
    const first = createDemoSessionToken();
    const second = createDemoSessionToken();

    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(first).not.toBe(second);
  });

  it('DB 저장용 SHA-256 digest만 만든다', () => {
    const token = createDemoSessionToken();
    const digest = digestDemoSessionToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
  });
});
