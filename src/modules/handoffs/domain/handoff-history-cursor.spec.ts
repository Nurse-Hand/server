import {
  decodeHandoffHistoryCursor,
  encodeHandoffHistoryCursor,
} from './handoff-history-cursor';

const EVENT_ID = '00000000-0000-4000-8000-000000000101';
const OCCURRED_AT = new Date('2026-08-19T03:00:00.000Z');

describe('handoff history cursor', () => {
  it('occurredAt과 UUID tie-breaker를 opaque cursor로 왕복한다', () => {
    const cursor = encodeHandoffHistoryCursor({
      occurredAt: OCCURRED_AT,
      id: EVENT_ID,
    });
    expect(cursor).not.toContain(EVENT_ID);
    expect(decodeHandoffHistoryCursor(cursor)).toEqual({
      occurredAt: OCCURRED_AT,
      id: EVENT_ID,
    });
  });

  it.each([
    Buffer.from(
      JSON.stringify({ id: EVENT_ID, occurredAt: OCCURRED_AT.toISOString() }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        occurredAt: OCCURRED_AT.toISOString(),
        id: EVENT_ID,
        extra: true,
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ occurredAt: 'invalid', id: EVENT_ID }),
    ).toString('base64url'),
    'not-json',
    `${encodeHandoffHistoryCursor({ occurredAt: OCCURRED_AT, id: EVENT_ID })}=`,
  ])('canonical하지 않은 cursor를 400 code+kind로 거부한다', (value) => {
    try {
      decodeHandoffHistoryCursor(value);
      throw new Error('history cursor error가 발생해야 합니다.');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'HANDOFF_CURSOR_INVALID',
        kind: 'BAD_REQUEST',
      });
    }
  });
});
