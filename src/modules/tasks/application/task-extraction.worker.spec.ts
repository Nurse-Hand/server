import { Clock } from '../../../common/time/clock';
import { AiJobService } from '../../ai-jobs/application/ai-job.service';
import type { AiJobClaim } from '../../ai-jobs/application/ports/ai-job.repository';
import {
  TaskAiResponseInvalidError,
  TaskAiTimeoutError,
} from '../domain/task.errors';
import {
  TASK_EXTRACTION_LEASE_MILLISECONDS,
  TASK_EXTRACTION_OPERATION,
} from '../domain/task.types';
import type {
  ExtractedTaskCandidate,
  TaskExtractionAiGateway,
} from './ports/task-extraction-ai.gateway';
import type {
  TaskPriorityAiGateway,
  TaskPrioritySuggestion,
} from './ports/task-priority-ai.gateway';
import type {
  TaskExtractionWorkItem,
  TaskRepository,
} from './ports/task.repository';
import { TaskExtractionWorker } from './task-extraction.worker';

const NOW = new Date('2026-08-19T00:00:00.000Z');
const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const JOB_ID = '00000000-0000-4000-8000-000000000401';
const REQUEST_ID = '00000000-0000-4000-8000-000000000501';
const EVIDENCE_ID_A = '00000000-0000-4000-8000-000000000601';
const EVIDENCE_ID_B = '00000000-0000-4000-8000-000000000602';
const UNKNOWN_EVIDENCE_ID = '00000000-0000-4000-8000-000000000699';

class FixedClock extends Clock {
  constructor(private readonly current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }
}

describe('TaskExtractionWorker', () => {
  let aiJobs: jest.Mocked<AiJobService>;
  let repository: jest.Mocked<TaskRepository>;
  let extractionGateway: jest.Mocked<TaskExtractionAiGateway>;
  let priorityGateway: jest.Mocked<TaskPriorityAiGateway>;
  let worker: TaskExtractionWorker;

  beforeEach(() => {
    aiJobs = createAiJobsMock();
    repository = createRepositoryMock();
    extractionGateway = { extract: jest.fn() };
    priorityGateway = { prioritize: jest.fn() };

    aiJobs.claimNext.mockResolvedValue(CLAIM);
    repository.findExtractionWorkItem.mockResolvedValue(WORK_ITEM);
    extractionGateway.extract.mockResolvedValue([createCandidate()]);
    priorityGateway.prioritize.mockResolvedValue([createSuggestion()]);

    worker = new TaskExtractionWorker(
      aiJobs,
      repository,
      extractionGateway,
      priorityGateway,
      new FixedClock(NOW),
    );
  });

  it('claim할 작업이 없으면 gateway와 repository 결과 저장 없이 IDLE을 반환한다', async () => {
    aiJobs.claimNext.mockResolvedValueOnce(null);

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({ status: 'IDLE' });
    expect(aiJobs.claimNext).toHaveBeenCalledWith({
      datasetId: DATASET_ID,
      wardId: WARD_ID,
      operation: TASK_EXTRACTION_OPERATION,
      leaseMilliseconds: TASK_EXTRACTION_LEASE_MILLISECONDS,
    });
    expect(repository.findExtractionWorkItem).not.toHaveBeenCalled();
    expect(extractionGateway.extract).not.toHaveBeenCalled();
    expect(repository.completeExtraction).not.toHaveBeenCalled();
  });

  it('정상 결과를 candidateKey 순서로 결합하고 leaseVersion 조건부 성공 transaction에 전달한다', async () => {
    const dueAt = new Date('2026-08-19T15:00:00.000Z');
    const candidateB = createCandidate({
      candidateKey: 'candidate-b',
      evidenceSourceIds: [EVIDENCE_ID_A],
    });
    const candidateA = createCandidate({
      candidateKey: 'candidate-a',
      dueAt,
      evidenceSourceIds: [EVIDENCE_ID_B],
    });
    extractionGateway.extract.mockResolvedValue([candidateB, candidateA]);
    priorityGateway.prioritize.mockResolvedValue([
      createSuggestion({
        candidateKey: 'candidate-b',
        suggestedPriority: 'NORMAL',
        evidenceSourceIds: [EVIDENCE_ID_A],
      }),
      createSuggestion({
        candidateKey: 'candidate-a',
        suggestedPriority: 'HIGH',
        evidenceSourceIds: [EVIDENCE_ID_B],
      }),
    ]);

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({ status: 'SUCCEEDED', jobId: JOB_ID });

    expect(repository.findExtractionWorkItem).toHaveBeenCalledWith(
      DATASET_ID,
      JOB_ID,
    );
    expect(extractionGateway.extract).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      evidence: WORK_ITEM.evidence,
    });
    expect(priorityGateway.prioritize).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      candidates: [candidateB, candidateA],
    });
    expect(repository.completeExtraction).toHaveBeenCalledWith({
      claim: {
        jobId: JOB_ID,
        datasetId: DATASET_ID,
        actorId: ACTOR_ID,
        wardId: WARD_ID,
        leaseVersion: CLAIM.leaseVersion,
      },
      candidates: [
        {
          candidateKey: 'candidate-a',
          patientId: null,
          title: '라운딩 후속 업무',
          description: null,
          dueAt,
          workDate: new Date('2026-08-20T00:00:00.000Z'),
          suggestedPriority: 'HIGH',
          reasons: ['후속 확인 필요'],
          confidence: 'MEDIUM',
          evidenceSourceIds: [EVIDENCE_ID_B],
        },
        {
          candidateKey: 'candidate-b',
          patientId: null,
          title: '라운딩 후속 업무',
          description: null,
          dueAt: null,
          workDate: new Date('2026-08-19T00:00:00.000Z'),
          suggestedPriority: 'NORMAL',
          reasons: ['후속 확인 필요'],
          confidence: 'MEDIUM',
          evidenceSourceIds: [EVIDENCE_ID_A],
        },
      ],
      now: NOW,
    });
    expect(aiJobs.complete).not.toHaveBeenCalled();
    expect(aiJobs.fail).not.toHaveBeenCalled();
  });

  it('빈 AI 결과도 부분 실패가 아닌 SUCCEEDED 빈 결과로 원자적 완료한다', async () => {
    extractionGateway.extract.mockResolvedValueOnce([]);
    priorityGateway.prioritize.mockResolvedValueOnce([]);

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({ status: 'SUCCEEDED', jobId: JOB_ID });
    expect(priorityGateway.prioritize).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      candidates: [],
    });
    expect(repository.completeExtraction).toHaveBeenCalledWith({
      claim: expect.objectContaining({
        jobId: JOB_ID,
        leaseVersion: CLAIM.leaseVersion,
      }),
      candidates: [],
      now: NOW,
    });
    expect(aiJobs.fail).not.toHaveBeenCalled();
  });

  it.each(['extraction', 'priority'] as const)(
    '%s gateway timeout은 같은 leaseVersion으로 retryable 실패 전이한다',
    async (target) => {
      if (target === 'extraction') {
        extractionGateway.extract.mockRejectedValueOnce(
          new TaskAiTimeoutError(),
        );
      } else {
        priorityGateway.prioritize.mockRejectedValueOnce(
          new TaskAiTimeoutError(),
        );
      }

      await expect(
        worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
      ).resolves.toEqual({
        status: 'FAILED',
        jobId: JOB_ID,
        failureCode: 'TASK_AI_TIMEOUT',
      });
      expect(aiJobs.fail).toHaveBeenCalledWith({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: CLAIM.leaseVersion,
        failureCode: 'TASK_AI_TIMEOUT',
        retryable: true,
      });
      expect(repository.completeExtraction).not.toHaveBeenCalled();
    },
  );

  it('categorical confidence가 아닌 응답은 전체를 non-retryable 실패 처리한다', async () => {
    priorityGateway.prioritize.mockResolvedValueOnce([
      createSuggestion({ confidence: 'VERY_HIGH' as never }),
    ]);

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({
      status: 'FAILED',
      jobId: JOB_ID,
      failureCode: 'TASK_AI_RESPONSE_INVALID',
    });
    expect(aiJobs.fail).toHaveBeenCalledWith({
      datasetId: DATASET_ID,
      jobId: JOB_ID,
      leaseVersion: CLAIM.leaseVersion,
      failureCode: 'TASK_AI_RESPONSE_INVALID',
      retryable: false,
    });
    expect(repository.completeExtraction).not.toHaveBeenCalled();
  });

  it('런타임 AI 응답에 계약 밖 필드가 추가되면 저장하지 않고 전체 실패한다', async () => {
    priorityGateway.prioritize.mockResolvedValueOnce([
      {
        ...createSuggestion(),
        unexpectedField: 'not-allowed',
      } as unknown as TaskPrioritySuggestion,
    ]);

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({
      status: 'FAILED',
      jobId: JOB_ID,
      failureCode: 'TASK_AI_RESPONSE_INVALID',
    });
    expect(aiJobs.fail).toHaveBeenCalledWith({
      datasetId: DATASET_ID,
      jobId: JOB_ID,
      leaseVersion: CLAIM.leaseVersion,
      failureCode: 'TASK_AI_RESPONSE_INVALID',
      retryable: false,
    });
    expect(repository.completeExtraction).not.toHaveBeenCalled();
  });

  it('한 후보라도 snapshot 밖 evidence를 참조하면 부분 후보 없이 전체 실패한다', async () => {
    const valid = createCandidate({ candidateKey: 'candidate-a' });
    const invalid = createCandidate({
      candidateKey: 'candidate-b',
      evidenceSourceIds: [UNKNOWN_EVIDENCE_ID],
    });
    extractionGateway.extract.mockResolvedValueOnce([valid, invalid]);
    priorityGateway.prioritize.mockResolvedValueOnce([
      createSuggestion({ candidateKey: 'candidate-a' }),
      createSuggestion({
        candidateKey: 'candidate-b',
        evidenceSourceIds: [UNKNOWN_EVIDENCE_ID],
      }),
    ]);

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({
      status: 'FAILED',
      jobId: JOB_ID,
      failureCode: 'TASK_AI_RESPONSE_INVALID',
    });
    expect(aiJobs.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        leaseVersion: CLAIM.leaseVersion,
        failureCode: 'TASK_AI_RESPONSE_INVALID',
        retryable: false,
      }),
    );
    expect(repository.completeExtraction).not.toHaveBeenCalled();
  });

  it.each([
    [
      '중복 candidate key',
      [createCandidate(), createCandidate()],
      [createSuggestion(), createSuggestion()],
    ],
    ['candidate와 suggestion 개수 불일치', [createCandidate()], []],
    [
      '빈 priority reasons',
      [createCandidate()],
      [createSuggestion({ reasons: [] })],
    ],
    [
      'candidate 밖 suggestion evidence',
      [createCandidate()],
      [createSuggestion({ evidenceSourceIds: [EVIDENCE_ID_B] })],
    ],
  ])(
    '%s invalid 응답은 결과를 저장하지 않고 전체 실패한다',
    async (_label, candidates, suggestions) => {
      extractionGateway.extract.mockResolvedValueOnce(candidates);
      priorityGateway.prioritize.mockResolvedValueOnce(suggestions);

      await expect(
        worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
      ).resolves.toMatchObject({
        status: 'FAILED',
        failureCode: 'TASK_AI_RESPONSE_INVALID',
      });
      expect(aiJobs.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          failureCode: 'TASK_AI_RESPONSE_INVALID',
          retryable: false,
        }),
      );
      expect(repository.completeExtraction).not.toHaveBeenCalled();
    },
  );

  it('gateway의 명시적 invalid response 오류도 동일한 실패 전이로 변환한다', async () => {
    extractionGateway.extract.mockRejectedValueOnce(
      new TaskAiResponseInvalidError(),
    );

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'TASK_AI_RESPONSE_INVALID',
    });
    expect(aiJobs.fail).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: false }),
    );
  });

  it('알 수 없는 gateway 장애는 retryable unavailable로 안전하게 축약한다', async () => {
    extractionGateway.extract.mockRejectedValueOnce(
      new Error('sensitive upstream body'),
    );

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({
      status: 'FAILED',
      jobId: JOB_ID,
      failureCode: 'TASK_AI_UNAVAILABLE',
    });
    expect(aiJobs.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: 'TASK_AI_UNAVAILABLE',
        retryable: true,
      }),
    );
  });

  it('성공 transaction의 lease fencing 실패는 FAILED로 덮어쓰지 않고 전파한다', async () => {
    const leaseError = new Error('lease lost');
    repository.completeExtraction.mockRejectedValueOnce(leaseError);

    await expect(
      worker.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).rejects.toBe(leaseError);
    expect(aiJobs.fail).not.toHaveBeenCalled();
  });
});

const CLAIM: AiJobClaim = {
  jobId: JOB_ID,
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
  operation: TASK_EXTRACTION_OPERATION,
  requestId: REQUEST_ID,
  attempt: 1,
  maxAttempts: 3,
  leaseVersion: 7,
  claimedAt: new Date('2026-08-18T23:59:00.000Z'),
  leaseExpiresAt: new Date('2026-08-19T00:01:00.000Z'),
};

const WORK_ITEM: TaskExtractionWorkItem = {
  jobId: JOB_ID,
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
  requestId: REQUEST_ID,
  evidence: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      recordId: EVIDENCE_ID_A,
      sourceType: 'TIMELINE_EVENT',
      sourceId: EVIDENCE_ID_A,
      patientId: null,
      workDate: new Date('2026-08-19T00:00:00.000Z'),
      summary: 'Synthetic evidence A',
    },
    {
      id: '00000000-0000-4000-8000-000000000702',
      recordId: EVIDENCE_ID_B,
      sourceType: 'TIMELINE_EVENT',
      sourceId: EVIDENCE_ID_B,
      patientId: null,
      workDate: new Date('2026-08-19T00:00:00.000Z'),
      summary: 'Synthetic evidence B',
    },
  ],
};

function createAiJobsMock(): jest.Mocked<AiJobService> {
  return {
    claimNext: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  } as unknown as jest.Mocked<AiJobService>;
}

function createRepositoryMock(): jest.Mocked<TaskRepository> {
  return {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findExtractionReservationReplay: jest.fn(),
    reserveExtraction: jest.fn(),
    findExtractionWorkItem: jest.fn(),
    completeExtraction: jest.fn().mockResolvedValue(undefined),
    findExtractionJob: jest.fn(),
    applyCandidates: jest.fn(),
  };
}

function createCandidate(
  overrides: Partial<ExtractedTaskCandidate> = {},
): ExtractedTaskCandidate {
  return {
    candidateKey: 'candidate-a',
    patientId: null,
    title: '라운딩 후속 업무',
    description: null,
    dueAt: null,
    evidenceSourceIds: [EVIDENCE_ID_A],
    ...overrides,
  };
}

function createSuggestion(
  overrides: Partial<TaskPrioritySuggestion> = {},
): TaskPrioritySuggestion {
  return {
    candidateKey: 'candidate-a',
    suggestedPriority: 'NORMAL',
    reasons: ['후속 확인 필요'],
    confidence: 'MEDIUM',
    evidenceSourceIds: [EVIDENCE_ID_A],
    ...overrides,
  };
}
