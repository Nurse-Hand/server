import { Clock } from '../../../common/time/clock';
import { AiJobService } from '../../ai-jobs/application/ai-job.service';
import type {
  AiJobClaim,
  AiJobRepository,
} from '../../ai-jobs/application/ports/ai-job.repository';
import { DeterministicHandoffDraftAiGateway } from '../infrastructure/ai/deterministic-handoff-draft-ai.gateway';
import { HandoffDraftJobProcessor } from './handoff-draft-job.processor';
import type { HandoffDraftAiGateway } from './ports/handoff-draft-ai.gateway';
import type { HandoffDraftRepository } from './ports/handoff-draft.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const EVENT_ID = '00000000-0000-4000-8000-000000000501';
const TASK_ID = '00000000-0000-4000-8000-000000000601';
const ITEM_ID = '00000000-0000-4000-8000-000000000701';
const HANDOFF_ID = '00000000-0000-4000-8000-000000000801';
const JOB_ID = '00000000-0000-4000-8000-000000000901';
const REQUEST_ID = '10000000-0000-4000-8000-000000000101';
const NOW = new Date('2026-08-18T02:00:00.000Z');

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

describe('HandoffDraftJobProcessor', () => {
  it('6개 임상 section과 snapshot citation excerpt를 fenced publish한다', async () => {
    const jobs = createJobs();
    const repository = createRepository(true);
    const processor = createProcessor(
      jobs,
      repository,
      new DeterministicHandoffDraftAiGateway(),
    );

    await expect(
      processor.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({ jobId: JOB_ID, status: 'SUCCEEDED' });
    const published = repository.publishResult.mock.calls[0]![0].result;
    expect(published.patients[0].sections).toHaveLength(6);
    expect(
      published.patients[0].sections.map(({ section }) => section),
    ).toEqual([
      'PATIENT_STATUS',
      'PAIN',
      'TREATMENT',
      'DIET',
      'ACTIVITY',
      'OBSERVATION',
    ]);
    expect(
      published.patients[0].sections.flatMap(({ citations }) => citations),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'TIMELINE_EVENT',
          sourceReference: 'timeline:event:501',
          occurredAt: NOW,
          excerptKind: 'SUMMARY',
          excerpt: '체온 상승 관찰',
        }),
        expect.objectContaining({
          sourceType: 'TASK',
          sourceReference: 'task:601',
          occurredAt: null,
          excerptKind: 'TASK_TITLE',
          excerpt: '해열 후 체온 재측정',
        }),
      ]),
    );
    expect(published.warnings).toEqual([
      expect.objectContaining({ itemId: ITEM_ID, answer: 'UNVERIFIED' }),
    ]);
  });

  it('includeUnverified=false이면 UNVERIFIED item을 AI 입력과 AI warning에서 제외한다', async () => {
    const jobs = createJobs();
    const repository = createRepository(false);
    const delegate = new DeterministicHandoffDraftAiGateway();
    const gateway: jest.Mocked<HandoffDraftAiGateway> = {
      generate: jest
        .fn()
        .mockImplementation((input) => delegate.generate(input)),
    };
    const processor = createProcessor(jobs, repository, gateway);

    await processor.processNext({ datasetId: DATASET_ID, wardId: WARD_ID });

    expect(gateway.generate).toHaveBeenCalledWith(
      expect.objectContaining({ includeUnverified: false, precheckItems: [] }),
    );
    expect(repository.publishResult).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({ warnings: [] }),
      }),
    );
  });

  it.each([
    ['TIMEOUT', 'HANDOFF_AI_TIMEOUT', true],
    ['RATE_LIMIT', 'HANDOFF_AI_RATE_LIMITED', true],
    ['INVALID_RESPONSE', 'HANDOFF_AI_INVALID_RESPONSE', false],
    ['UNAVAILABLE', 'HANDOFF_AI_UNAVAILABLE', true],
  ] as const)(
    '%s gateway 실패를 shared AiJob 실패로 전이한다',
    async (scenario, failureCode, retryable) => {
      const jobs = createJobs();
      const repository = createRepository(true);
      const processor = createProcessor(
        jobs,
        repository,
        new DeterministicHandoffDraftAiGateway({ scenario }),
      );

      await expect(
        processor.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
      ).resolves.toEqual({ jobId: JOB_ID, status: 'FAILED', failureCode });
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(jobs.fail).toHaveBeenCalledWith(
        expect.objectContaining({ failureCode, retryable }),
      );
    },
  );

  it('getWork와 publishResult 내부 오류는 AI 실패로 오분류하지 않는다', async () => {
    const getError = new Error('get work invariant');
    const jobs = createJobs();
    const repository = createRepository(true);
    repository.getWork.mockRejectedValueOnce(getError);
    const gateway: jest.Mocked<HandoffDraftAiGateway> = { generate: jest.fn() };

    await expect(
      createProcessor(jobs, repository, gateway).processNext({
        datasetId: DATASET_ID,
        wardId: WARD_ID,
      }),
    ).rejects.toBe(getError);
    expect(gateway.generate).not.toHaveBeenCalled();
    expect(jobs.fail).not.toHaveBeenCalled();

    const publishError = new Error('publish invariant');
    const secondRepository = createRepository(true);
    secondRepository.publishResult.mockRejectedValueOnce(publishError);
    await expect(
      createProcessor(
        jobs,
        secondRepository,
        new DeterministicHandoffDraftAiGateway(),
      ).processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).rejects.toBe(publishError);
    expect(jobs.fail).not.toHaveBeenCalled();
  });
});

function createProcessor(
  jobs: jest.Mocked<AiJobRepository>,
  repository: jest.Mocked<HandoffDraftRepository>,
  gateway: HandoffDraftAiGateway,
) {
  return new HandoffDraftJobProcessor(
    new AiJobService(jobs, new FixedClock()),
    repository,
    gateway,
    new FixedClock(),
  );
}

function createJobs(): jest.Mocked<AiJobRepository> {
  return {
    reserve: jest.fn(),
    claimNext: jest.fn().mockResolvedValue(claim()),
    complete: jest.fn(),
    fail: jest.fn().mockResolvedValue(true),
  };
}

function claim(): AiJobClaim {
  return {
    jobId: JOB_ID,
    datasetId: DATASET_ID,
    actorId: ACTOR_ID,
    wardId: WARD_ID,
    operation: 'handoffs.generate',
    requestId: REQUEST_ID,
    attempt: 1,
    maxAttempts: 3,
    leaseVersion: 1,
    claimedAt: NOW,
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
  };
}

function createRepository(
  includeUnverified: boolean,
): jest.Mocked<HandoffDraftRepository> {
  return {
    findReplay: jest.fn(),
    reserve: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    getWork: jest.fn().mockResolvedValue({
      handoffId: HANDOFF_ID,
      templateId: 'NURSING_HANDOFF_V1',
      includeUnverified,
      snapshot: {
        capturedAt: NOW,
        patients: [
          {
            patientId: PATIENT_ID,
            timelineEvents: [
              {
                id: EVENT_ID,
                patientId: PATIENT_ID,
                occurredAt: NOW,
                type: 'OBSERVATION',
                source: 'MANUAL',
                summary: '체온 상승 관찰',
                version: 1,
                sourceReference: 'timeline:event:501',
              },
            ],
          },
        ],
        tasks: [
          {
            id: TASK_ID,
            patientId: PATIENT_ID,
            title: '해열 후 체온 재측정',
            dueAt: null,
            effectivePriority: 'CRITICAL',
            version: 1,
            sourceReferences: ['task:601'],
            updatedAt: NOW,
          },
        ],
      },
      precheckItems: [
        {
          itemId: ITEM_ID,
          patientId: PATIENT_ID,
          severity: 'CRITICAL',
          question: '현재 체온을 확인해 주세요.',
          reason: '관찰 기록이 있습니다.',
          evidence: [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: EVENT_ID,
              sourceReference: 'timeline:event:501',
              occurredAt: NOW,
              excerptKind: 'SUMMARY',
              excerpt: '체온 상승 관찰',
            },
          ],
          answer: 'UNVERIFIED',
          comment: null,
          version: 2,
        },
      ],
    }),
    publishResult: jest.fn().mockResolvedValue(undefined),
  };
}
