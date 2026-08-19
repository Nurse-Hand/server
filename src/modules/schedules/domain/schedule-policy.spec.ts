import {
  daysInYearMonth,
  isYearMonth,
  needsOcrReview,
  normalizeOcrToken,
} from './schedule-policy';

describe('schedule policy', () => {
  it('윤년을 포함한 월의 날짜 수를 계산한다', () => {
    expect(daysInYearMonth('2028-02')).toBe(29);
    expect(daysInYearMonth('2027-02')).toBe(28);
  });

  it('엄격한 YYYY-MM만 허용한다', () => {
    expect(isYearMonth('2026-08')).toBe(true);
    expect(isYearMonth('2026-8')).toBe(false);
    expect(isYearMonth('2026-13')).toBe(false);
  });

  it('지원하지 않는 OCR token은 UNKNOWN으로 제한한다', () => {
    expect(normalizeOcrToken(' d ')).toBe('D');
    expect(normalizeOcrToken('vacation')).toBe('UNKNOWN');
  });

  it('UNKNOWN 또는 저신뢰 셀만 검토 대상으로 표시한다', () => {
    expect(needsOcrReview('D', 0.85)).toBe(false);
    expect(needsOcrReview('N', 0.8499)).toBe(true);
    expect(needsOcrReview('UNKNOWN', 1)).toBe(true);
  });
});
