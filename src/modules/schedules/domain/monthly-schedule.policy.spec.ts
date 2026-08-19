import {
  daysInYearMonth,
  isYearMonth,
  normalizeScheduleEntries,
  type ScheduleEntryInput,
} from './monthly-schedule.policy';

describe('monthly schedule policy', () => {
  it('윤년을 포함한 월의 날짜 수를 계산한다', () => {
    expect(daysInYearMonth('2028-02')).toBe(29);
    expect(daysInYearMonth('2027-02')).toBe(28);
  });

  it('2000년부터 2100년까지 엄격한 YYYY-MM만 허용한다', () => {
    expect(isYearMonth('2026-08')).toBe(true);
    expect(isYearMonth('2026-8')).toBe(false);
    expect(isYearMonth('1999-12')).toBe(false);
    expect(isYearMonth('2101-01')).toBe(false);
    expect(isYearMonth('2026-13')).toBe(false);
  });

  it('canonical duty를 날짜순으로 정규화한다', () => {
    expect(
      normalizeScheduleEntries('2026-08', [
        { date: '2026-08-02', duty: 'OFF' },
        { date: '2026-08-01', duty: 'DAY' },
      ]),
    ).toEqual([
      { date: '2026-08-01', duty: 'DAY' },
      { date: '2026-08-02', duty: 'OFF' },
    ]);
  });

  it.each([
    [[{ date: '2026-09-01', duty: 'DAY' }]],
    [[{ date: '2026-02-29', duty: 'DAY' }]],
    [
      [
        { date: '2026-08-01', duty: 'DAY' },
        { date: '2026-08-01', duty: 'OFF' },
      ],
    ],
    [[{ date: '2026-08-01', duty: 'UNKNOWN' }]],
  ])('월 밖·실재하지 않음·중복·허용되지 않은 duty를 거부한다', (entries) => {
    expect(() =>
      normalizeScheduleEntries('2026-08', entries as ScheduleEntryInput[]),
    ).toThrow(TypeError);
  });

  it('빈 월을 유효한 전체 교체 값으로 허용한다', () => {
    expect(normalizeScheduleEntries('2026-08', [])).toEqual([]);
  });
});
