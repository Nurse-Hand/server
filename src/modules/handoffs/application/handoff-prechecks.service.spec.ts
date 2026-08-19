import { Clock } from '../../../common/time/clock';
import type { TaskQueryPort } from '../../tasks/application/ports/task-query.port';
import type { TimelineReader } from '../../timeline/application/ports/timeline-reader';
import { HandoffPrechecksService } from './handoff-prechecks.service';
import type { HandoffPrecheckContext } from './handoff-precheck.models';
import type { HandoffPrecheckRepository } from './ports/handoff-precheck.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const RECEIVER_ID = '00000000-0000-4000-8000-000000000202';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const SHIFT_ID = '00000000-0000-4000-8000-000000000401';
const RECEIVER_SHIFT_ID = '00000000-0000-4000-8000-000000000402';
const PATIENT_ID = '00000000-0000-4000-8000-000000000501';
const EVENT_ID = '00000000-0000-4000-8000-000000000601';
const TASK_ID = '00000000-0000-4000-8000-000000000701';
const PRECHECK_ID = '00000000-0000-4000-8000-000000000801';
const ITEM_ID = '00000000-0000-4000-8000-000000000802';
const JOB_ID = '10000000-0000-4000-8000-000000000101';
const REQUEST_ID = '10000000-0000-4000-8000-000000000201';
const NOW = new Date('2026-08-18T02:00:00.000Z');
const CONTEXT: HandoffPrecheckContext = {
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
};

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

describe('HandoffPrechecksService', () => {
  it('동일 요청은 time-sensitive source를 다시 읽지 않고 receipt를 replay한다', async () => {
    const repository = createRepository();
    const timeline = createTimelineReader();
    const tasks = createTaskQueryPort();
    repository.findReplay.mockResolvedValueOnce({
      resourceId: PRECHECK_ID,
      jobId: JOB_ID,
      isReplay: true,
    });

    await expect(
      createService(repository, timeline, tasks).create(
        CONTEXT,
        { shiftId: SHIFT_ID, targetDuty: 'EVENING', date: '2026-08-18' },
        'precheck-key',
        REQUEST_ID,
      ),
    ).resolves.toEqual({ precheckId: PRECHECK_ID, status: 'QUEUED' });

    expect(repository.resolveShiftScope).not.toHaveBeenCalled();
    expect(timeline.readMany).not.toHaveBeenCalled();
    expect(tasks.findIncompleteByPatients).not.toHaveBeenCalled();
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it('TimelineReader와 TaskQueryPort를 한 번씩 읽어 고정 snapshot으로 예약한다', async () => {
    const repository = createRepository();
    const timeline = createTimelineReader();
    const tasks = createTaskQueryPort();

    await createService(repository, timeline, tasks).create(
      CONTEXT,
      { shiftId: SHIFT_ID, targetDuty: 'EVENING', date: '2026-08-18' },
      'precheck-key',
      REQUEST_ID,
    );

    expect(timeline.readMany).toHaveBeenCalledWith({
      context: CONTEXT,
      patientIds: [PATIENT_ID],
    });
    expect(tasks.findIncompleteByPatients).toHaveBeenCalledWith(CONTEXT, [
      PATIENT_ID,
    ]);
    expect(repository.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        context: CONTEXT,
        requestId: REQUEST_ID,
        maxAttempts: 3,
        snapshot: {
          capturedAt: NOW,
          patients: [
            {
              patientId: PATIENT_ID,
              timelineEvents: [expect.objectContaining({ id: EVENT_ID })],
            },
          ],
          tasks: [expect.objectContaining({ id: TASK_ID })],
        },
      }),
    );
  });

  it('조회와 version 조건부 답변을 session context로 repository에 위임한다', async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.get(CONTEXT, PRECHECK_ID);
    await service.answerItem(CONTEXT, PRECHECK_ID, ITEM_ID, {
      answer: 'INCLUDE_HANDOFF',
      comment: '인계 필요',
      version: 1,
    });

    expect(repository.get).toHaveBeenCalledWith(CONTEXT, PRECHECK_ID);
    expect(repository.answerItem).toHaveBeenCalledWith({
      context: CONTEXT,
      precheckId: PRECHECK_ID,
      itemId: ITEM_ID,
      answer: 'INCLUDE_HANDOFF',
      comment: '인계 필요',
      version: 1,
      now: NOW,
    });
  });
});

function createService(
  repository = createRepository(),
  timeline = createTimelineReader(),
  tasks = createTaskQueryPort(),
) {
  return new HandoffPrechecksService(
    repository,
    timeline,
    tasks,
    new FixedClock(),
  );
}

function createRepository(): jest.Mocked<HandoffPrecheckRepository> {
  return {
    resolveShiftScope: jest.fn().mockResolvedValue({
      senderShiftId: SHIFT_ID,
      senderStartsAt: new Date('2026-08-18T01:00:00.000Z'),
      senderEndsAt: new Date('2026-08-18T09:00:00.000Z'),
      receiverShiftId: RECEIVER_SHIFT_ID,
      receiverActorId: RECEIVER_ID,
      receiverStartsAt: new Date('2026-08-18T09:00:00.000Z'),
      patientIds: [PATIENT_ID],
    }),
    findReplay: jest.fn().mockResolvedValue(null),
    reserve: jest.fn().mockResolvedValue({
      resourceId: PRECHECK_ID,
      jobId: JOB_ID,
      isReplay: false,
    }),
    get: jest.fn().mockResolvedValue({
      precheckId: PRECHECK_ID,
      version: 1,
      job: {
        jobId: JOB_ID,
        status: 'QUEUED',
        failureCode: null,
        retryable: null,
      },
      modelVersion: null,
      contractVersion: null,
      generatedAt: null,
      items: [],
    }),
    answerItem: jest.fn().mockResolvedValue({
      itemId: ITEM_ID,
      answer: 'INCLUDE_HANDOFF',
      version: 2,
    }),
    getWork: jest.fn(),
    publishResult: jest.fn(),
  };
}

function createTimelineReader(): jest.Mocked<TimelineReader> {
  return {
    read: jest.fn(),
    readMany: jest.fn().mockResolvedValue([
      {
        id: EVENT_ID,
        patientId: PATIENT_ID,
        occurredAt: NOW,
        type: 'OBSERVATION',
        source: 'MANUAL',
        summary: '체온 상승 관찰',
        version: 1,
        sourceReference: 'timeline:event:601',
      },
    ]),
  };
}

function createTaskQueryPort(): jest.Mocked<TaskQueryPort> {
  return {
    findIncompleteByPatients: jest.fn().mockResolvedValue([
      {
        id: TASK_ID,
        patientId: PATIENT_ID,
        title: '체온 재측정',
        dueAt: null,
        effectivePriority: 'HIGH',
        version: 1,
        sourceReferences: ['task:701'],
        updatedAt: NOW,
      },
    ]),
  };
}
