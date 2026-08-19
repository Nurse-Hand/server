import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import { Clock } from '../../../common/time/clock';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  TaskApplyInvalidError,
  TaskCommandInvalidError,
  TaskDueAtInvalidError,
  TaskExtractionEvidenceEmptyError,
  TaskExtractionEvidenceInvalidError,
} from '../domain/task.errors';
import { TASK_EXTRACTION_MAX_ATTEMPTS } from '../domain/task.types';
import type {
  TaskExtractionEvidencePort,
  TaskExtractionEvidenceSnapshot,
} from './ports/task-extraction-evidence.port';
import type { TaskRepository, TaskView } from './ports/task.repository';
import { TaskService } from './task.service';

const CONTEXT: DemoSessionContext = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};
const NOW = new Date('2026-08-19T00:00:00.000Z');
const REQUEST_ID = '00000000-0000-4000-8000-000000000401';
const ROUNDING_SESSION_ID = '00000000-0000-4000-8000-000000000501';
const RECORD_ID_A = '00000000-0000-4000-8000-000000000601';
const RECORD_ID_B = '00000000-0000-4000-8000-000000000602';
const JOB_ID = '00000000-0000-4000-8000-000000000701';
const JOB_ID_B = '00000000-0000-4000-8000-000000000702';
const CANDIDATE_ID_A = '00000000-0000-4000-8000-000000000801';
const CANDIDATE_ID_B = '00000000-0000-4000-8000-000000000802';

class FixedClock extends Clock {
  constructor(private readonly current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }
}

describe('TaskService', () => {
  let repository: jest.Mocked<TaskRepository>;
  let evidencePort: jest.Mocked<TaskExtractionEvidencePort>;
  let service: TaskService;

  beforeEach(() => {
    repository = createRepositoryMock();
    evidencePort = { read: jest.fn() };
    evidencePort.read.mockResolvedValue(
      createEvidenceSnapshot([RECORD_ID_A, RECORD_ID_B]),
    );
    service = new TaskService(repository, evidencePort, new FixedClock(NOW));
  });

  describe('list', () => {
    it('date를 파싱하고 기본 sort와 limit 및 Clock을 repository에 전달한다', async () => {
      await service.list(CONTEXT, { date: '2026-08-19' });

      expect(repository.list).toHaveBeenCalledWith({
        context: CONTEXT,
        workDate: new Date('2026-08-19T00:00:00.000Z'),
        date: '2026-08-19',
        sort: 'priority',
        limit: 20,
        now: NOW,
      });
    });

    it.each([
      [{ date: '2026-08-19', status: 'INVALID' as never }],
      [{ date: '2026-08-19', sort: 'INVALID' as never }],
      [{ date: '2026-08-19', limit: 0 }],
      [{ date: '2026-08-19', limit: 51 }],
      [{ date: '2026-08-19', limit: 1.5 }],
      [{ date: '2026-02-30' }],
    ])('잘못된 목록 명령 %j을 repository 전에 거부한다', (command) => {
      expect(() => service.list(CONTEXT, command)).toThrow(
        TaskCommandInvalidError,
      );
      expect(repository.list).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('문자열과 nullable 값을 정규화하고 KST workDate와 canonical hash를 전달한다', async () => {
      await service.create(CONTEXT, 'create-key', REQUEST_ID, {
        patientId: null,
        title: '  통증 재평가  ',
        description: '  30분 후 확인  ',
        dueAt: '2026-08-19T15:00:00.000Z',
        priorityOverride: 'HIGH',
      });

      expect(repository.create).toHaveBeenCalledWith({
        context: CONTEXT,
        idempotencyKey: 'create-key',
        requestHash: createCanonicalRequestHash({
          path: {},
          query: {},
          body: {
            description: '30분 후 확인',
            dueAt: '2026-08-19T15:00:00.000Z',
            patientId: null,
            priorityOverride: 'HIGH',
            title: '통증 재평가',
          },
        }),
        patientId: null,
        title: '통증 재평가',
        description: '30분 후 확인',
        dueAt: new Date('2026-08-19T15:00:00.000Z'),
        workDate: new Date('2026-08-20T00:00:00.000Z'),
        confirmedPriority: 'HIGH',
        now: NOW,
      });
    });

    it('생략과 null 및 동등한 timestamp 표현을 같은 request hash로 정규화한다', async () => {
      await service.create(CONTEXT, 'same-key', REQUEST_ID, {
        title: '  업무  ',
        dueAt: '2026-08-20T00:00:00.000Z',
      });
      await service.create(CONTEXT, 'same-key', REQUEST_ID, {
        patientId: null,
        title: '업무',
        description: null,
        dueAt: '2026-08-20T09:00:00+09:00',
        priorityOverride: null,
      });

      const first = repository.create.mock.calls[0][0];
      const second = repository.create.mock.calls[1][0];
      expect(second.requestHash).toBe(first.requestHash);
      expect(second).toMatchObject({
        patientId: null,
        title: '업무',
        description: null,
        dueAt: new Date('2026-08-20T00:00:00.000Z'),
        confirmedPriority: null,
      });
    });

    it.each(['x', 'x'.repeat(128)])(
      '허용된 idempotency key 길이 경계 %p를 통과시킨다',
      async (idempotencyKey) => {
        await service.create(CONTEXT, idempotencyKey, REQUEST_ID, {
          title: '업무',
          dueAt: '2026-08-20T00:00:00.000Z',
        });

        expect(repository.create).toHaveBeenCalledWith(
          expect.objectContaining({ idempotencyKey }),
        );
      },
    );

    it.each(['', 'x'.repeat(129), 'contains space', '한글-key', '\u007f'])(
      '잘못된 idempotency key %p를 거부한다',
      (idempotencyKey) => {
        expect(() =>
          service.create(CONTEXT, idempotencyKey, REQUEST_ID, {
            title: '업무',
            dueAt: '2026-08-20T00:00:00.000Z',
          }),
        ).toThrow(TaskCommandInvalidError);
        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['현재 시각', NOW.toISOString()],
      ['과거', new Date(NOW.getTime() - 1).toISOString()],
    ])('%s dueAt을 422 domain error로 거부한다', (_label, dueAt) => {
      expect(() =>
        service.create(CONTEXT, 'key', REQUEST_ID, {
          title: '업무',
          dueAt,
        }),
      ).toThrow(TaskDueAtInvalidError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('현재보다 1ms 미래인 dueAt을 허용한다', async () => {
      const dueAt = new Date(NOW.getTime() + 1);

      await service.create(CONTEXT, 'key', REQUEST_ID, {
        title: '업무',
        dueAt: dueAt.toISOString(),
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueAt }),
      );
    });

    it('timezone이 없는 외부 timestamp를 거부한다', () => {
      expect(() =>
        service.create(CONTEXT, 'key', REQUEST_ID, {
          title: '업무',
          dueAt: '2026-08-20T09:00:00',
        }),
      ).toThrow(TaskCommandInvalidError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each([
      [{ title: '', dueAt: '2026-08-20T00:00:00.000Z' }],
      [{ title: 'x'.repeat(201), dueAt: '2026-08-20T00:00:00.000Z' }],
      [
        {
          title: '업무',
          description: 'x'.repeat(1001),
          dueAt: '2026-08-20T00:00:00.000Z',
        },
      ],
      [
        {
          title: '업무',
          dueAt: 'not-a-timestamp',
        },
      ],
      [
        {
          title: '업무',
          dueAt: '2026-08-20T00:00:00.000Z',
          priorityOverride: 'URGENT' as never,
        },
      ],
    ])('잘못된 직접 생성 값 %j을 거부한다', (command) => {
      expect(() => service.create(CONTEXT, 'key', REQUEST_ID, command)).toThrow(
        TaskCommandInvalidError,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('reserveExtraction', () => {
    it('저장된 PROCESSING receipt는 evidence를 다시 읽지 않고 replay한다', async () => {
      repository.findExtractionReservationReplay.mockResolvedValue({
        jobId: JOB_ID,
        status: 'PROCESSING',
        isReplay: true,
      });

      await expect(
        service.reserveExtraction(CONTEXT, 'extract-key', REQUEST_ID, {
          roundingSessionId: ROUNDING_SESSION_ID,
          recordIds: [RECORD_ID_A],
        }),
      ).resolves.toEqual({
        jobId: JOB_ID,
        status: 'PROCESSING',
        isReplay: true,
      });
      expect(evidencePort.read).not.toHaveBeenCalled();
      expect(repository.reserveExtraction).not.toHaveBeenCalled();
    });

    it('record ID 순서를 정규화해 evidence snapshot과 같은 hash를 예약한다', async () => {
      evidencePort.read.mockImplementation(({ roundingSessionId, recordIds }) =>
        Promise.resolve(createEvidenceSnapshot(recordIds, roundingSessionId)),
      );

      await service.reserveExtraction(CONTEXT, 'extract-key', REQUEST_ID, {
        roundingSessionId: ROUNDING_SESSION_ID,
        recordIds: [RECORD_ID_B, RECORD_ID_A],
      });
      await service.reserveExtraction(CONTEXT, 'extract-key', REQUEST_ID, {
        roundingSessionId: ROUNDING_SESSION_ID,
        recordIds: [RECORD_ID_A, RECORD_ID_B],
      });

      expect(evidencePort.read).toHaveBeenNthCalledWith(1, {
        context: CONTEXT,
        roundingSessionId: ROUNDING_SESSION_ID,
        recordIds: [RECORD_ID_A, RECORD_ID_B],
      });
      const first = repository.reserveExtraction.mock.calls[0][0];
      const second = repository.reserveExtraction.mock.calls[1][0];
      expect(second.requestHash).toBe(first.requestHash);
      expect(first).toMatchObject({
        context: CONTEXT,
        idempotencyKey: 'extract-key',
        requestId: REQUEST_ID,
        maxAttempts: TASK_EXTRACTION_MAX_ATTEMPTS,
        now: NOW,
      });
    });

    it.each([
      [[]],
      [[RECORD_ID_A, RECORD_ID_A]],
      [
        Array.from(
          { length: 101 },
          (_, index) =>
            `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
        ),
      ],
    ])(
      '비어 있거나 중복·최대 크기 초과인 record ID %j를 evidence 조회 전에 거부한다',
      async (recordIds) => {
        await expect(
          service.reserveExtraction(CONTEXT, 'extract-key', REQUEST_ID, {
            roundingSessionId: ROUNDING_SESSION_ID,
            recordIds,
          }),
        ).rejects.toBeInstanceOf(TaskCommandInvalidError);
        expect(evidencePort.read).not.toHaveBeenCalled();
        expect(repository.reserveExtraction).not.toHaveBeenCalled();
      },
    );

    it('빈 evidence snapshot은 422로 거부하고 예약하지 않는다', async () => {
      evidencePort.read.mockResolvedValue({
        roundingSessionId: ROUNDING_SESSION_ID,
        evidence: [],
      });

      await expect(
        service.reserveExtraction(CONTEXT, 'extract-key', REQUEST_ID, {
          roundingSessionId: ROUNDING_SESSION_ID,
          recordIds: [RECORD_ID_A],
        }),
      ).rejects.toBeInstanceOf(TaskExtractionEvidenceEmptyError);
      expect(repository.reserveExtraction).not.toHaveBeenCalled();
    });

    it.each([
      [
        '다른 session ID',
        {
          ...createEvidenceSnapshot([RECORD_ID_A]),
          roundingSessionId: JOB_ID,
        },
        [RECORD_ID_A],
      ],
      [
        '요청 밖 record ID',
        createEvidenceSnapshot([RECORD_ID_B]),
        [RECORD_ID_A],
      ],
      [
        '요청 record 일부 누락',
        createEvidenceSnapshot([RECORD_ID_A]),
        [RECORD_ID_A, RECORD_ID_B],
      ],
      [
        '허용되지 않은 source type',
        {
          roundingSessionId: ROUNDING_SESSION_ID,
          evidence: [
            {
              ...createEvidenceSnapshot([RECORD_ID_A]).evidence[0],
              sourceType: 'ROUNDING_RECORD' as never,
            },
          ],
        },
        [RECORD_ID_A],
      ],
    ])('%s snapshot 전체를 거부한다', async (_label, snapshot, recordIds) => {
      evidencePort.read.mockResolvedValue(snapshot);

      await expect(
        service.reserveExtraction(CONTEXT, 'extract-key', REQUEST_ID, {
          roundingSessionId: ROUNDING_SESSION_ID,
          recordIds,
        }),
      ).rejects.toBeInstanceOf(TaskExtractionEvidenceInvalidError);
      expect(repository.reserveExtraction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('최소 한 수정 필드와 positive integer version을 요구한다', () => {
      expect(() =>
        service.update(CONTEXT, TASK_VIEW.id, { version: 1 }),
      ).toThrow(TaskCommandInvalidError);
      expect(() =>
        service.update(CONTEXT, TASK_VIEW.id, { version: 0, title: '업무' }),
      ).toThrow(TaskCommandInvalidError);
      expect(() =>
        service.update(CONTEXT, TASK_VIEW.id, { version: 1.5, title: '업무' }),
      ).toThrow(TaskCommandInvalidError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('dueAt null 복원을 422로 거부한다', () => {
      expect(() =>
        service.update(CONTEXT, TASK_VIEW.id, { version: 1, dueAt: null }),
      ).toThrow(TaskDueAtInvalidError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('명시적 nullable과 과거 dueAt을 보존하고 workDate를 재계산한다', async () => {
      await service.update(CONTEXT, TASK_VIEW.id, {
        version: 3,
        title: '  수정 업무  ',
        description: '   ',
        dueAt: '2026-08-18T15:00:00.000Z',
        status: 'DONE',
        priorityOverride: null,
      });

      expect(repository.update).toHaveBeenCalledWith({
        context: CONTEXT,
        taskId: TASK_VIEW.id,
        expectedVersion: 3,
        title: '수정 업무',
        description: null,
        dueAt: new Date('2026-08-18T15:00:00.000Z'),
        workDate: new Date('2026-08-19T00:00:00.000Z'),
        status: 'DONE',
        confirmedPriority: null,
        now: NOW,
      });
    });

    it('omitted nullable field는 repository update에서 생략한다', async () => {
      await service.update(CONTEXT, TASK_VIEW.id, {
        version: 1,
        status: 'IN_PROGRESS',
      });

      const input = repository.update.mock.calls[0][0];
      expect(input).not.toHaveProperty('description');
      expect(input).not.toHaveProperty('dueAt');
      expect(input).not.toHaveProperty('confirmedPriority');
    });

    it('AI 제안 수락 식별자와 확정 우선순위를 함께 repository에 전달한다', async () => {
      await service.update(CONTEXT, TASK_VIEW.id, {
        version: 1,
        priorityOverride: 'CRITICAL',
        prioritySuggestionId: JOB_ID,
      });

      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmedPriority: 'CRITICAL',
          prioritySuggestionId: JOB_ID,
        }),
      );
    });

    it('prioritySuggestionId 단독 또는 null 확정 조합을 거부한다', () => {
      expect(() =>
        service.update(CONTEXT, TASK_VIEW.id, {
          version: 1,
          prioritySuggestionId: JOB_ID,
        }),
      ).toThrow(TaskCommandInvalidError);
      expect(() =>
        service.update(CONTEXT, TASK_VIEW.id, {
          version: 1,
          priorityOverride: null,
          prioritySuggestionId: JOB_ID,
        }),
      ).toThrow(TaskCommandInvalidError);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('repository의 optimistic version conflict를 그대로 보존한다', async () => {
      repository.update.mockRejectedValueOnce(new VersionConflictError(1, 2));

      await expect(
        service.update(CONTEXT, TASK_VIEW.id, {
          version: 1,
          status: 'DONE',
        }),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', kind: 'CONFLICT' });
    });
  });

  describe('applyCandidates', () => {
    it.each([
      ['빈 items', { items: [] }],
      [
        '중복 candidate',
        {
          items: [
            { candidateId: CANDIDATE_ID_A, selected: true },
            { candidateId: CANDIDATE_ID_A, selected: true },
          ],
        },
      ],
      [
        '선택되지 않은 item의 override',
        {
          items: [
            { candidateId: CANDIDATE_ID_A, selected: false, title: '수정' },
          ],
        },
      ],
      [
        '선택된 후보 없음',
        { items: [{ candidateId: CANDIDATE_ID_A, selected: false }] },
      ],
    ])('%s 요청을 repository 호출 전에 거부한다', (_label, command) => {
      expect(() =>
        service.applyCandidates(CONTEXT, JOB_ID, 'apply-key', command),
      ).toThrow(TaskApplyInvalidError);
      expect(repository.applyCandidates).not.toHaveBeenCalled();
    });

    it('선택 후보만 정렬·정규화하고 null override를 보존한다', async () => {
      await service.applyCandidates(CONTEXT, JOB_ID, 'apply-key', {
        items: [
          {
            candidateId: CANDIDATE_ID_B,
            selected: true,
            title: '  후보 B  ',
            dueAt: null,
            priorityOverride: null,
          },
          {
            candidateId: CANDIDATE_ID_A,
            selected: true,
            dueAt: '2026-08-20T09:00:00+09:00',
            priorityOverride: 'HIGH',
          },
        ],
      });
      expect(repository.applyCandidates).toHaveBeenCalledWith({
        context: CONTEXT,
        jobId: JOB_ID,
        idempotencyKey: 'apply-key',
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        items: [
          {
            candidateId: CANDIDATE_ID_A,
            dueAt: new Date('2026-08-20T00:00:00.000Z'),
            priorityOverride: 'HIGH',
          },
          {
            candidateId: CANDIDATE_ID_B,
            title: '후보 B',
            dueAt: null,
            priorityOverride: null,
          },
        ],
        now: NOW,
      });
    });

    it('item 순서는 hash에 영향을 주지 않고 jobId는 hash에 포함한다', async () => {
      const first = {
        items: [
          { candidateId: CANDIDATE_ID_B, selected: true },
          { candidateId: CANDIDATE_ID_A, selected: true },
        ],
      };
      const second = { items: [...first.items].reverse() };
      await service.applyCandidates(CONTEXT, JOB_ID, 'key', first);
      await service.applyCandidates(CONTEXT, JOB_ID, 'key', second);
      await service.applyCandidates(CONTEXT, JOB_ID_B, 'key', second);
      expect(repository.applyCandidates.mock.calls[1][0].requestHash).toBe(
        repository.applyCandidates.mock.calls[0][0].requestHash,
      );
      expect(repository.applyCandidates.mock.calls[2][0].requestHash).not.toBe(
        repository.applyCandidates.mock.calls[0][0].requestHash,
      );
    });
  });
});

const TASK_VIEW: TaskView = {
  id: '00000000-0000-4000-8000-000000000901',
  patientId: null,
  title: '업무',
  description: null,
  dueAt: new Date('2026-08-20T00:00:00.000Z'),
  workDate: new Date('2026-08-20T00:00:00.000Z'),
  status: 'TODO',
  source: 'MANUAL',
  aiSuggestedPriority: null,
  aiReasons: [],
  aiConfidence: null,
  rulePriority: 'NORMAL',
  confirmedPriority: null,
  effectivePriority: 'NORMAL',
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

function createRepositoryMock(): jest.Mocked<TaskRepository> {
  return {
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    create: jest.fn().mockResolvedValue({ task: TASK_VIEW, isReplay: false }),
    update: jest.fn().mockResolvedValue(TASK_VIEW),
    findExtractionReservationReplay: jest.fn().mockResolvedValue(null),
    reserveExtraction: jest.fn().mockResolvedValue({
      jobId: JOB_ID,
      status: 'QUEUED',
      isReplay: false,
    }),
    findExtractionWorkItem: jest.fn(),
    completeExtraction: jest.fn(),
    findExtractionJob: jest.fn(),
    applyCandidates: jest.fn(),
  };
}

function createEvidenceSnapshot(
  recordIds: readonly string[],
  roundingSessionId = ROUNDING_SESSION_ID,
): TaskExtractionEvidenceSnapshot {
  return {
    roundingSessionId,
    evidence: recordIds.map((recordId, index) => ({
      recordId,
      sourceType: 'TIMELINE_EVENT',
      sourceId: recordId,
      patientId: null,
      workDate: new Date('2026-08-19T00:00:00.000Z'),
      summary: `Synthetic evidence ${index + 1}`,
    })),
  };
}
