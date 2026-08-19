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
              priority: 'LOW',
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
          tasks: input().tasks,
          patientRisk: [],
          now: '2026-08-19T00:00:00.000Z',
        }),
      }),
    );
    expect(result.suggestions).toEqual([
      {
        taskId: TASK_ID,
        aiScore: 7.5,
        aiSuggestedPriority: 'NORMAL',
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

  it('잘못된 JSON을 502 error로 변환한다', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{', { status: 201 }));
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
        patientId: '00000000-0000-4000-8000-000000000401',
        title: '통증 재평가',
        dueAt: '2026-08-19T01:00:00.000Z',
        carriedOver: false,
      },
    ],
    now: '2026-08-19T00:00:00.000Z',
  };
}
