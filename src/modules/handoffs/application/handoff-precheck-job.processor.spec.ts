import { Clock } from '../../../common/time/clock';
import { AiJobService } from '../../ai-jobs/application/ai-job.service';
import type {
  AiJobClaim,
  AiJobRepository,
} from '../../ai-jobs/application/ports/ai-job.repository';
import { DeterministicHandoffPrecheckAiGateway } from '../infrastructure/ai/deterministic-handoff-precheck-ai.gateway';
import { HandoffPrecheckJobProcessor } from './handoff-precheck-job.processor';
import type { HandoffPrecheckRepository } from './ports/handoff-precheck.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const EVENT_ID = '00000000-0000-4000-8000-000000000501';
const TASK_ID = '00000000-0000-4000-8000-000000000601';
const JOB_ID = '00000000-0000-4000-8000-000000000801';
const REQUEST_ID = '00000000-0000-4000-8000-000000000901';
const PRECHECK_ID = '10000000-0000-4000-8000-000000000102';
const NOW = new Date('2026-08-18T02:00:00.000Z');

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

describe('HandoffPrecheckJobProcessor', () => {
  it('AI 호출 후 Timeline SUMMARY와 Task title excerpt를 fenced publish한다', async () => {
    const aiJobs = aiJobRepository();
    const repository = precheckRepository();
    const processor = new HandoffPrecheckJobProcessor(
      new AiJobService(aiJobs, new FixedClock()),
      repository,
      new DeterministicHandoffPrecheckAiGateway(),
      new FixedClock(),
    );

    await expect(
      processor.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
    ).resolves.toEqual({ jobId: JOB_ID, status: 'SUCCEEDED' });
    expect(repository.publishResult).toHaveBeenCalledWith({
      claim: expect.objectContaining({ jobId: JOB_ID, leaseVersion: 1 }),
      result: expect.objectContaining({
        items: [
          expect.objectContaining({
            evidence: [
              expect.objectContaining({
                sourceId: EVENT_ID,
                sourceReference: 'timeline:event:501',
                occurredAt: NOW,
                excerptKind: 'SUMMARY',
                excerpt: '체온 상승 관찰',
              }),
              expect.objectContaining({
                sourceId: TASK_ID,
                sourceReference: 'task:601',
                occurredAt: null,
                excerptKind: 'TASK_TITLE',
                excerpt: '해열 후 체온 재측정',
              }),
            ],
          }),
        ],
      }),
      now: NOW,
    });
    expect(aiJobs.complete).not.toHaveBeenCalled();
  });

  it.each([
    ['TIMEOUT', 'HANDOFF_AI_TIMEOUT', true],
    ['RATE_LIMIT', 'HANDOFF_AI_RATE_LIMITED', true],
    ['INVALID_RESPONSE', 'HANDOFF_AI_INVALID_RESPONSE', false],
    ['UNAVAILABLE', 'HANDOFF_AI_UNAVAILABLE', true],
  ] as const)(
    '%s 실패는 부분 publish 없이 AiJob 실패 전이한다',
    async (scenario, failureCode, retryable) => {
      const aiJobs = aiJobRepository();
      const repository = precheckRepository();
      const processor = new HandoffPrecheckJobProcessor(
        new AiJobService(aiJobs, new FixedClock()),
        repository,
        new DeterministicHandoffPrecheckAiGateway({ scenario }),
        new FixedClock(),
      );

      await expect(
        processor.processNext({ datasetId: DATASET_ID, wardId: WARD_ID }),
      ).resolves.toEqual({ jobId: JOB_ID, status: 'FAILED', failureCode });
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(aiJobs.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: DATASET_ID,
          jobId: JOB_ID,
          leaseVersion: 1,
          failureCode,
          retryable,
        }),
      );
    },
  );
});

function claim(): AiJobClaim {
  return {
    jobId: JOB_ID,
    datasetId: DATASET_ID,
    actorId: ACTOR_ID,
    wardId: WARD_ID,
    operation: 'handoffs.precheck',
    requestId: REQUEST_ID,
    attempt: 1,
    maxAttempts: 3,
    leaseVersion: 1,
    claimedAt: NOW,
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
  };
}

function aiJobRepository(): jest.Mocked<AiJobRepository> {
  return {
    reserve: jest.fn(),
    claimNext: jest.fn().mockResolvedValue(claim()),
    complete: jest.fn().mockResolvedValue(true),
    fail: jest.fn().mockResolvedValue(true),
  };
}

function precheckRepository(): jest.Mocked<HandoffPrecheckRepository> {
  return {
    resolveShiftScope: jest.fn(),
    findReplay: jest.fn(),
    reserve: jest.fn(),
    get: jest.fn(),
    answerItem: jest.fn(),
    getWork: jest.fn().mockResolvedValue({
      precheckId: PRECHECK_ID,
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
    }),
    publishResult: jest.fn().mockResolvedValue(undefined),
  };
}
