import { Clock } from '../../../common/time/clock';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  TaskAiTimeoutError,
  TaskPrioritySuggestionLimitExceededError,
} from '../domain/task.errors';
import type { TaskPrioritySuggestionGateway } from './ports/task-priority-suggestion.gateway';
import type {
  TaskPrioritySuggestionBatchResult,
  TaskPrioritySuggestionRepository,
} from './ports/task-priority-suggestion.repository';
import { TaskPrioritySuggestionService } from './task-priority-suggestion.service';

const CONTEXT: DemoSessionContext = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};
const REQUEST_ID = '00000000-0000-4000-8000-000000000701';
const BATCH_ID = '00000000-0000-4000-8000-000000000702';
const TASK_ID = '00000000-0000-4000-8000-000000000601';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const NOW = new Date('2026-08-19T00:00:00.000Z');

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

describe('TaskPrioritySuggestionService', () => {
  let repository: jest.Mocked<TaskPrioritySuggestionRepository>;
  let gateway: jest.Mocked<TaskPrioritySuggestionGateway>;
  let service: TaskPrioritySuggestionService;

  beforeEach(() => {
    repository = repositoryMock();
    gateway = { prioritize: jest.fn() };
    gateway.prioritize.mockResolvedValue({
      requestId: REQUEST_ID,
      suggestions: [
        {
          taskId: TASK_ID,
          aiScore: 9,
          aiSuggestedPriority: 'CRITICAL',
          reasons: ['즉시 확인 필요'],
        },
      ],
    });
    service = new TaskPrioritySuggestionService(
      repository,
      gateway,
      new FixedClock(),
    );
  });

  it('수동 미완료 snapshot을 고정하고 환자 있는 업무만 AI에 전달한다', async () => {
    const skippedTaskId = '00000000-0000-4000-8000-000000000602';
    repository.findSnapshot.mockResolvedValue([
      snapshotTask({ taskId: skippedTaskId, patientId: null }),
      snapshotTask(),
    ]);

    await service.createBatch(CONTEXT, 'priority-key', REQUEST_ID, {
      date: '2026-08-19',
    });

    expect(repository.findSnapshot).toHaveBeenCalledWith({
      context: CONTEXT,
      workDate: new Date('2026-08-19T00:00:00.000Z'),
      now: NOW,
    });
    expect(repository.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        context: CONTEXT,
        workDate: new Date('2026-08-19T00:00:00.000Z'),
        idempotencyKey: 'priority-key',
        requestId: REQUEST_ID,
        inputSnapshot: [
          snapshotTask(),
          snapshotTask({ taskId: skippedTaskId, patientId: null }),
        ],
      }),
    );
    expect(gateway.prioritize).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      tasks: [
        {
          taskId: TASK_ID,
          patientId: PATIENT_ID,
          title: '통증 재평가',
          dueAt: '2026-08-19T01:00:00.000Z',
          carriedOver: false,
        },
      ],
      now: NOW.toISOString(),
    });
    expect(repository.completeSuccess).toHaveBeenCalledWith({
      context: CONTEXT,
      batchId: BATCH_ID,
      suggestions: [
        {
          taskId: TASK_ID,
          taskVersion: 1,
          aiScore: 9,
          aiSuggestedPriority: 'CRITICAL',
          reasons: ['즉시 확인 필요'],
        },
      ],
      skippedTaskIds: [skippedTaskId],
      evaluatedAt: NOW,
    });
  });

  it('평가할 환자 업무가 없으면 AI를 호출하지 않고 빈 성공을 저장한다', async () => {
    repository.findSnapshot.mockResolvedValue([
      snapshotTask({ patientId: null }),
    ]);

    await service.createBatch(CONTEXT, 'priority-key', REQUEST_ID, {
      date: '2026-08-19',
    });

    expect(gateway.prioritize).not.toHaveBeenCalled();
    expect(repository.completeSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestions: [],
        skippedTaskIds: [TASK_ID],
      }),
    );
  });

  it('완료된 성공 replay는 AI를 다시 호출하지 않는다', async () => {
    repository.reserve.mockResolvedValue({
      state: 'SUCCEEDED',
      result: batchResult({ isReplay: true }),
    });

    const result = await service.createBatch(
      CONTEXT,
      'priority-key',
      REQUEST_ID,
      { date: '2026-08-19' },
    );

    expect(result.isReplay).toBe(true);
    expect(gateway.prioritize).not.toHaveBeenCalled();
  });

  it('AI timeout을 안전한 실패 snapshot으로 완료한 뒤 같은 오류를 반환한다', async () => {
    gateway.prioritize.mockRejectedValue(new TaskAiTimeoutError());

    await expect(
      service.createBatch(CONTEXT, 'priority-key', REQUEST_ID, {
        date: '2026-08-19',
      }),
    ).rejects.toBeInstanceOf(TaskAiTimeoutError);

    expect(repository.completeFailure).toHaveBeenCalledWith({
      context: CONTEXT,
      batchId: BATCH_ID,
      failure: { code: 'TASK_AI_TIMEOUT', httpStatus: 504 },
      evaluatedAt: NOW,
    });
  });

  it('50개를 넘는 snapshot은 reservation과 AI 호출 전에 거부한다', async () => {
    repository.findSnapshot.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) =>
        snapshotTask({
          taskId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        }),
      ),
    );

    await expect(
      service.createBatch(CONTEXT, 'priority-key', REQUEST_ID, {
        date: '2026-08-19',
      }),
    ).rejects.toBeInstanceOf(TaskPrioritySuggestionLimitExceededError);
    expect(repository.reserve).not.toHaveBeenCalled();
    expect(gateway.prioritize).not.toHaveBeenCalled();
  });
});

function repositoryMock(): jest.Mocked<TaskPrioritySuggestionRepository> {
  return {
    findSnapshot: jest.fn().mockResolvedValue([snapshotTask()]),
    reserve: jest
      .fn()
      .mockResolvedValue({ state: 'RESERVED', batchId: BATCH_ID }),
    completeSuccess: jest.fn().mockResolvedValue(batchResult()),
    completeFailure: jest.fn().mockResolvedValue(undefined),
  };
}

function snapshotTask(
  overrides: Partial<{
    taskId: string;
    patientId: string | null;
    title: string;
    dueAt: Date | null;
    version: number;
  }> = {},
) {
  return {
    taskId: TASK_ID,
    patientId: PATIENT_ID,
    title: '통증 재평가',
    dueAt: new Date('2026-08-19T01:00:00.000Z'),
    version: 1,
    ...overrides,
  };
}

function batchResult(
  overrides: Partial<TaskPrioritySuggestionBatchResult> = {},
): TaskPrioritySuggestionBatchResult {
  return {
    batchId: BATCH_ID,
    evaluatedAt: NOW,
    contractVersion: 'tasks-prioritize-v1',
    suggestions: [],
    skippedTaskIds: [],
    isReplay: false,
    ...overrides,
  };
}
