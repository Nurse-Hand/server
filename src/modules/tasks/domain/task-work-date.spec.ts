import { TaskCommandInvalidError } from './task.errors';
import {
  deriveSeoulWorkDate,
  formatTaskWorkDate,
  parseTaskWorkDate,
} from './task-work-date';

describe('task work date', () => {
  it.each([
    ['2026-08-18T14:59:59.999Z', '2026-08-18'],
    ['2026-08-18T15:00:00.000Z', '2026-08-19'],
    ['2026-12-31T15:00:00.000Z', '2027-01-01'],
  ])('%s를 Asia/Seoul 업무일 %s로 파생한다', (timestamp, expected) => {
    expect(formatTaskWorkDate(deriveSeoulWorkDate(new Date(timestamp)))).toBe(
      expected,
    );
  });

  it('유효한 윤년 2월 29일을 UTC 자정 Date로 파싱한다', () => {
    const parsed = parseTaskWorkDate('2028-02-29');

    expect(parsed.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(formatTaskWorkDate(parsed)).toBe('2028-02-29');
  });

  it.each([
    '2027-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
  ])('존재하지 않는 날짜 %s를 거부한다', (value) => {
    expect(() => parseTaskWorkDate(value)).toThrow(TaskCommandInvalidError);
  });

  it.each(['2026-8-19', '26-08-19', '2026/08/19', '2026-08-19T00:00:00Z', ''])(
    'YYYY-MM-DD가 아닌 값 %p를 거부한다',
    (value) => {
      expect(() => parseTaskWorkDate(value)).toThrow(TaskCommandInvalidError);
    },
  );

  it('형식 오류와 달력 오류를 동일한 안정적 application error로 공개한다', () => {
    for (const value of ['2026/08/19', '2026-02-30']) {
      try {
        parseTaskWorkDate(value);
        throw new Error('예상한 오류가 발생하지 않았습니다.');
      } catch (error: unknown) {
        expect(error).toMatchObject({
          code: 'TASK_COMMAND_INVALID',
          kind: 'BAD_REQUEST',
        });
      }
    }
  });
});
