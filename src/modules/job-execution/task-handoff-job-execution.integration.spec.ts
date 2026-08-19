import { Clock } from '../../common/time/clock';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import { AiJobService } from '../ai-jobs/application/ai-job.service';
import type {
  AiJobClaim,
  AiJobRepository,
} from '../ai-jobs/application/ports/ai-job.repository';
import type { HandoffDraftJobProcessor } from '../handoffs/application/handoff-draft-job.processor';
import type { HandoffPrecheckJobProcessor } from '../handoffs/application/handoff-precheck-job.processor';
import type { TaskRepository } from '../tasks/application/ports/task.repository';
import { TaskExtractionWorker } from '../tasks/application/task-extraction.worker';
import { TASK_EXTRACTION_OPERATION } from '../tasks/domain/task.types';
import { DeterministicTaskExtractionAiAdapter } from '../tasks/infrastructure/deterministic-task-extraction-ai.adapter';
import { DeterministicTaskPriorityAiAdapter } from '../tasks/infrastructure/deterministic-task-priority-ai.adapter';
import { TaskHandoffJobDispatcher } from './task-handoff-job.dispatcher';

const NOW = new Date('2026-08-19T00:00:00.000Z');
const SCOPE = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  wardId: '00000000-0000-4000-8000-000000000201',
};
const CLAIM: AiJobClaim = {
  jobId: '00000000-0000-4000-8000-000000000301',
  datasetId: SCOPE.datasetId,
  actorId: '00000000-0000-4000-8000-000000000401',
  wardId: SCOPE.wardId,
  operation: TASK_EXTRACTION_OPERATION,
  requestId: '00000000-0000-4000-8000-000000000501',
  attempt: 1,
  maxAttempts: 3,
  leaseVersion: 1,
  claimedAt: NOW,
  leaseExpiresAt: new Date('2026-08-19T00:01:00.000Z'),
};
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000601';

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

describe('Task/Handoff job execution integration', () => {
  it('dispatcher가 queued Task job을 claim하고 deterministic 결과를 publish한다', async () => {
    const aiJobRepository: jest.Mocked<AiJobRepository> = {
      reserve: jest.fn(),
      claimNext: jest.fn().mockResolvedValueOnce(CLAIM).mockResolvedValue(null),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    const taskRepository = {
      findExtractionWorkItem: jest.fn().mockResolvedValue({
        jobId: CLAIM.jobId,
        datasetId: CLAIM.datasetId,
        actorId: CLAIM.actorId,
        wardId: CLAIM.wardId,
        requestId: CLAIM.requestId,
        evidence: [
          {
            id: EVIDENCE_ID,
            recordId: EVIDENCE_ID,
            sourceType: 'TIMELINE_EVENT',
            sourceId: EVIDENCE_ID,
            patientId: null,
            workDate: NOW,
            summary: 'Synthetic evidence',
          },
        ],
      }),
      completeExtraction: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TaskRepository>;
    const clock = new FixedClock();
    const worker = new TaskExtractionWorker(
      new AiJobService(aiJobRepository, clock),
      taskRepository,
      new DeterministicTaskExtractionAiAdapter(),
      new DeterministicTaskPriorityAiAdapter(),
      clock,
    );
    const dispatcher = new TaskHandoffJobDispatcher(
      {
        aiJob: { findMany: jest.fn().mockResolvedValue([SCOPE]) },
      } as unknown as PrismaService,
      worker,
      {
        processNext: jest.fn().mockResolvedValue(null),
      } as unknown as HandoffPrecheckJobProcessor,
      {
        processNext: jest.fn().mockResolvedValue(null),
      } as unknown as HandoffDraftJobProcessor,
      clock,
    );

    await expect(dispatcher.runOnce()).resolves.toBe(true);

    expect(aiJobRepository.claimNext).toHaveBeenCalledWith({
      ...SCOPE,
      operation: TASK_EXTRACTION_OPERATION,
      claimedAt: NOW,
      leaseExpiresAt: new Date('2026-08-19T00:01:00.000Z'),
    });
    expect(taskRepository.completeExtraction).toHaveBeenCalledWith({
      claim: {
        jobId: CLAIM.jobId,
        datasetId: CLAIM.datasetId,
        actorId: CLAIM.actorId,
        wardId: CLAIM.wardId,
        leaseVersion: CLAIM.leaseVersion,
      },
      candidates: [
        expect.objectContaining({
          candidateKey: 'candidate-1',
          title: '라운딩 후속 업무 1',
          suggestedPriority: 'NORMAL',
          evidenceSourceIds: [EVIDENCE_ID],
        }),
      ],
      now: NOW,
    });
  });
});
