import { ConfigService } from '@nestjs/config';
import {
  TaskAiResponseInvalidError,
  TaskAiTimeoutError,
  TaskAiUnavailableError,
} from '../../domain/task.errors';
import { HttpTaskPrioritySuggestionAdapter } from './http-task-priority-suggestion.adapter';

const REQUEST_ID = '00000000-0000-4000-8000-000000000701';
const TASK_ID = '00000000-0000-4000-8000-000000000601';

describe('HttpTaskPrioritySuggestionAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('현재 AI header, request, 201 response 계약을 사용한다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          requestId: REQUEST_ID,
          results: [
            {
              taskId: TASK_ID,
              score: 7.5,
              priority: 'HIGH',
              reasons: ['정규 라운딩 확인'],
            },
          ],
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await adapter().prioritize(input());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example.test/internal/v1/tasks/prioritize',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': 'synthetic-token',
        },
        body: JSON.stringify({
          requestId: REQUEST_ID,
          tasks: [
            {
              taskId: TASK_ID,
              patientId: '00000000-0000-4000-8000-000000000401',
              title: '통증 재평가',
              dueAt: '2026-08-19T01:00:00.000Z',
              carriedOver: false,
            },
          ],
          patientRisk: [],
          now: '2026-08-19T00:00:00.000Z',
        }),
      }),
    );
    expect(result.suggestions).toEqual([
      {
        taskId: TASK_ID,
        aiScore: 7.5,
        aiSuggestedPriority: 'HIGH',
        reasons: ['정규 라운딩 확인'],
      },
    ]);
  });

  it('timeout이면 안전한 504 domain error로 변환한다', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );

    const pending = adapter({ AI_PRIORITY_TIMEOUT_MS: 10 }).prioritize(input());
    const expectation =
      expect(pending).rejects.toBeInstanceOf(TaskAiTimeoutError);
    await jest.advanceTimersByTimeAsync(10);
    await expectation;
    jest.useRealTimers();
  });

  it.each([401, 429, 500])(
    'upstream %i를 503 error로 변환한다',
    async (status) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(null, { status }));
      await expect(adapter().prioritize(input())).rejects.toBeInstanceOf(
        TaskAiUnavailableError,
      );
    },
  );

  it('non-201 response body를 취소한 뒤 503 error로 변환한다', async () => {
    const response = new Response('upstream error', { status: 500 });
    if (!response.body) throw new Error('response body가 필요합니다.');
    const cancel = jest.spyOn(response.body, 'cancel');
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    await expect(adapter().prioritize(input())).rejects.toBeInstanceOf(
      TaskAiUnavailableError,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('잘못된 JSON을 502 error로 변환한다', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{', { status: 201 }));
    await expect(adapter().prioritize(input())).rejects.toBeInstanceOf(
      TaskAiResponseInvalidError,
    );
  });

  it('Content-Length가 256 KiB를 초과하면 body를 읽기 전에 거부한다', async () => {
    const response = new Response('{}', { status: 201 });
    response.headers.set('Content-Length', String(256 * 1024 + 1));
    if (!response.body) throw new Error('response body가 필요합니다.');
    const cancel = jest.spyOn(response.body, 'cancel');
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    await expect(adapter().prioritize(input())).rejects.toBeInstanceOf(
      TaskAiResponseInvalidError,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('streaming body가 256 KiB를 초과하면 읽기를 중단하고 거부한다', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('x'.repeat(256 * 1024 + 1), { status: 201 }),
      );

    await expect(adapter().prioritize(input())).rejects.toBeInstanceOf(
      TaskAiResponseInvalidError,
    );
  });

  it('필수 구성이 없으면 fetch 전에 503 error로 거부한다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      adapter({ AI_INTERNAL_API_TOKEN: undefined }).prioritize(input()),
    ).rejects.toBeInstanceOf(TaskAiUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('병동 운영 업무는 현재 AI 계약에 맞는 sentinel patientId와 제목 prefix로 변환한다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          requestId: REQUEST_ID,
          results: [
            {
              taskId: TASK_ID,
              score: 4.5,
              priority: 'NORMAL',
              reasons: ['병동 운영 업무'],
            },
          ],
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await adapter().prioritize({
      requestId: REQUEST_ID,
      tasks: [
        {
          taskId: TASK_ID,
          scopeType: 'WARD',
          patientId: null,
          locationLabel: '물품 창고',
          title: '아세톤 재고 확인',
          description: '인수인계 전 병동 소모품 수량을 확인합니다.',
          dueAt: '2026-08-19T01:00:00.000Z',
          isCarryOver: true,
          dependencyTaskIds: [],
          priorityMeta: {
            patientStatusUrgency: null,
            timeSensitivity: 'MEDIUM',
            taskCriticality: 'LOW',
            isBlocking: false,
          },
        },
      ],
      now: '2026-08-19T00:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          requestId: REQUEST_ID,
          tasks: [
            {
              taskId: TASK_ID,
              patientId: 'WARD:물품 창고',
              title:
                '[병동 운영] - 아세톤 재고 확인 - 인수인계 전 병동 소모품 수량을 확인합니다.',
              dueAt: '2026-08-19T01:00:00.000Z',
              carriedOver: true,
            },
          ],
          patientRisk: [],
          now: '2026-08-19T00:00:00.000Z',
        }),
      }),
    );
  });
});

function adapter(
  values: Record<string, unknown> = {},
): HttpTaskPrioritySuggestionAdapter {
  const configuration = {
    AI_BASE_URL: 'https://ai.example.test',
    AI_INTERNAL_API_TOKEN: 'synthetic-token',
    AI_PRIORITY_TIMEOUT_MS: 15_000,
    ...values,
  };
  return new HttpTaskPrioritySuggestionAdapter(
    new ConfigService(configuration),
  );
}

function input() {
  return {
    requestId: REQUEST_ID,
    tasks: [
      {
        taskId: TASK_ID,
        scopeType: 'PATIENT' as const,
        patientId: '00000000-0000-4000-8000-000000000401',
        locationLabel: null,
        title: '통증 재평가',
        description: null,
        dueAt: '2026-08-19T01:00:00.000Z',
        isCarryOver: false,
        dependencyTaskIds: [],
        priorityMeta: {
          patientStatusUrgency: 'HIGH' as const,
          timeSensitivity: null,
          taskCriticality: 'MEDIUM' as const,
          isBlocking: false,
        },
      },
    ],
    now: '2026-08-19T00:00:00.000Z',
  };
}
