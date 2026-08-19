import { decodeHandoffCursor, encodeHandoffCursor } from './handoff-cursor';

const HANDOFF_ID = '00000000-0000-4000-8000-000000000101';
const UPDATED_AT = new Date('2026-08-19T02:00:00.000Z');

describe('handoff cursor', () => {
  it('stable updatedAt + UUID tie-breaker를 opaque cursor로 왕복한다', () => {
    const encoded = encodeHandoffCursor({
      updatedAt: UPDATED_AT,
      id: HANDOFF_ID,
    });

    expect(encoded).not.toContain(HANDOFF_ID);
    expect(decodeHandoffCursor(encoded)).toEqual({
      updatedAt: UPDATED_AT,
      id: HANDOFF_ID,
    });
  });

  it.each([
    Buffer.from(
      JSON.stringify({
        updatedAt: UPDATED_AT.toISOString(),
        id: '------------------------------------',
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ updatedAt: 'invalid', id: HANDOFF_ID }),
    ).toString('base64url'),
    'not-a-json-cursor',
  ])('잘못된 cursor를 domain 400으로 거부한다', (cursor) => {
    expect(() => decodeHandoffCursor(cursor)).toThrow('HANDOFF_CURSOR_INVALID');
  });
});
