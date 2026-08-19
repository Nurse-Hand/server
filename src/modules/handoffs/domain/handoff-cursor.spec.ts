import {
  HANDOFF_CLINICAL_SECTIONS,
  HANDOFF_TEMPLATE_IDS,
} from './handoff.constants';
import { decodeHandoffCursor, encodeHandoffCursor } from './handoff-cursor';
import { seoulDateRange } from './seoul-work-date';

const HANDOFF_ID = '00000000-0000-4000-8000-000000000101';
const UPDATED_AT = new Date('2026-08-19T02:00:00.000Z');

describe('handoff clinical section contract', () => {
  it('NURSING_HANDOFF_V1과 6개 임상 섹션을 고정한다', () => {
    expect(HANDOFF_TEMPLATE_IDS).toEqual(['NURSING_HANDOFF_V1']);
    expect(HANDOFF_CLINICAL_SECTIONS).toEqual([
      'PATIENT_STATUS',
      'PAIN',
      'TREATMENT',
      'DIET',
      'ACTIVITY',
      'OBSERVATION',
    ]);
  });
});

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
    `${encodeHandoffCursor({ updatedAt: UPDATED_AT, id: HANDOFF_ID })}=`,
  ])('잘못된 cursor를 domain 400으로 거부한다', (cursor) => {
    expectCursorError(cursor);
  });
});

describe('seoulDateRange', () => {
  it('실제 존재하는 YYYY-MM-DD를 Asia/Seoul 하루 범위로 변환한다', () => {
    expect(seoulDateRange('2024-02-29')).toEqual({
      from: new Date('2024-02-28T15:00:00.000Z'),
      to: new Date('2024-02-29T15:00:00.000Z'),
    });
  });

  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-8-19'])(
    '존재하지 않거나 canonical하지 않은 날짜 %s를 거부한다',
    (date) => {
      expect(() => seoulDateRange(date)).toThrow(TypeError);
    },
  );
});

function expectCursorError(cursor: string): void {
  try {
    decodeHandoffCursor(cursor);
    throw new Error('cursor error가 발생해야 합니다.');
  } catch (error) {
    expect(error).toMatchObject({
      code: 'HANDOFF_CURSOR_INVALID',
      kind: 'BAD_REQUEST',
    });
  }
}
