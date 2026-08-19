import { TaskCursorInvalidError } from './task.errors';
import {
  decodeTaskCursor,
  encodeTaskCursor,
  type TaskCursorFilter,
} from './task-cursor';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const PATIENT_ID = '00000000-0000-4000-8000-000000000101';
const FILTER: TaskCursorFilter = {
  date: '2026-08-19',
  sort: 'priority',
  status: 'TODO',
  patientId: PATIENT_ID,
};

describe('task cursor', () => {
  it('같은 filter에서 opaque cursor를 round-trip한다', () => {
    const cursor = encodeTaskCursor({ filter: FILTER, taskId: TASK_ID });

    expect(cursor).not.toContain(TASK_ID);
    expect(decodeTaskCursor(cursor, FILTER)).toEqual({
      version: 1,
      filterHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      taskId: TASK_ID,
    });
  });

  it.each([
    ['date', { ...FILTER, date: '2026-08-20' }],
    ['sort', { ...FILTER, sort: 'dueAt' as const }],
    ['status', { ...FILTER, status: 'DONE' as const }],
    [
      'patientId',
      {
        ...FILTER,
        patientId: '00000000-0000-4000-8000-000000000102',
      },
    ],
  ])('%s가 다른 요청의 cursor 재사용을 거부한다', (_field, otherFilter) => {
    const cursor = encodeTaskCursor({ filter: FILTER, taskId: TASK_ID });

    expect(() => decodeTaskCursor(cursor, otherFilter)).toThrow(
      TaskCursorInvalidError,
    );
  });

  it('생략한 optional filter와 undefined filter를 같은 값으로 정규화한다', () => {
    const cursor = encodeTaskCursor({
      filter: { date: FILTER.date, sort: FILTER.sort },
      taskId: TASK_ID,
    });

    expect(
      decodeTaskCursor(cursor, {
        date: FILTER.date,
        sort: FILTER.sort,
        status: undefined,
        patientId: undefined,
      }).taskId,
    ).toBe(TASK_ID);
  });

  it.each([
    ['', '빈 cursor'],
    ['a'.repeat(1025), '길이 제한을 넘은 cursor'],
    ['not-base64url', 'JSON이 아닌 cursor'],
    [encodePayload({}), '필수 필드가 없는 cursor'],
    [
      encodePayload({
        version: 2,
        filterHash: 'a'.repeat(64),
        taskId: TASK_ID,
      }),
      '지원하지 않는 version',
    ],
    [
      encodePayload({
        version: 1,
        filterHash: 'not-a-hash',
        taskId: TASK_ID,
      }),
      '잘못된 filter hash',
    ],
    [
      encodePayload({
        version: 1,
        filterHash: 'a'.repeat(64),
        taskId: 'not-a-uuid',
      }),
      '잘못된 task ID',
    ],
  ])('%s (%s)를 안정적인 cursor 오류로 거부한다', (cursor) => {
    try {
      decodeTaskCursor(cursor, FILTER);
      throw new Error('예상한 오류가 발생하지 않았습니다.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(TaskCursorInvalidError);
      expect(error).toMatchObject({
        code: 'TASK_CURSOR_INVALID',
        kind: 'BAD_REQUEST',
      });
    }
  });
});

function encodePayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
