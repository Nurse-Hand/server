import { Clock } from '../../../common/time/clock';
import type { TaskQueryPort } from '../../tasks/application/ports/task-query.port';
import type { HandoffDraftDetail } from './handoff-draft.models';
import { HandoffDraftsService } from './handoff-drafts.service';
import type { HandoffDraftRepository } from './ports/handoff-draft.repository';
import type { HandoffPrecheckRepository } from './ports/handoff-precheck.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const RECEIVER_ID = '00000000-0000-4000-8000-000000000202';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const PRECHECK_ID = '00000000-0000-4000-8000-000000000501';
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const JOB_ID = '00000000-0000-4000-8000-000000000701';
const ITEM_ID = '00000000-0000-4000-8000-000000000801';
const TASK_ID = '00000000-0000-4000-8000-000000000901';
const REQUEST_ID = '10000000-0000-4000-8000-000000000101';
const NOW = new Date('2026-08-18T02:00:00.000Z');
const CONTEXT = { datasetId: DATASET_ID, actorId: ACTOR_ID, wardId: WARD_ID };

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

describe('HandoffDraftsService', () => {
  it('동일 key와 요청은 precheck 상태를 다시 읽지 않고 reservation을 replay한다', async () => {
    const repository = createRepository();
    const prechecks = createPrechecks();
    repository.findReplay.mockResolvedValueOnce({
      resourceId: HANDOFF_ID,
      jobId: JOB_ID,
      isReplay: true,
    });

    await expect(
      createService(repository, prechecks).create(
        CONTEXT,
        {
          precheckId: PRECHECK_ID,
          templateId: 'NURSING_HANDOFF_V1',
          includeUnverified: false,
        },
        'generate-key',
        REQUEST_ID,
      ),
    ).resolves.toEqual({ handoffId: HANDOFF_ID, status: 'GENERATING' });
    expect(prechecks.get).not.toHaveBeenCalled();
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it('CRITICAL 미응답은 reservation 전에 422 code로 거부한다', async () => {
    const repository = createRepository();
    const prechecks = createPrechecks();
    prechecks.get.mockResolvedValueOnce(precheckDetail(null));

    await expect(
      createService(repository, prechecks).create(
        CONTEXT,
        {
          precheckId: PRECHECK_ID,
          templateId: 'NURSING_HANDOFF_V1',
          includeUnverified: true,
        },
        'generate-key',
        REQUEST_ID,
      ),
    ).rejects.toMatchObject({
      code: 'HANDOFF_CRITICAL_ANSWER_REQUIRED',
      kind: 'UNPROCESSABLE_ENTITY',
    });
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it('성공한 precheck와 canonical request hash로 GENERATING을 예약한다', async () => {
    const repository = createRepository();
    const prechecks = createPrechecks();

    await createService(repository, prechecks).create(
      CONTEXT,
      {
        precheckId: PRECHECK_ID,
        templateId: 'NURSING_HANDOFF_V1',
        includeUnverified: true,
      },
      'generate-key',
      REQUEST_ID,
    );

    expect(repository.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        context: CONTEXT,
        precheckId: PRECHECK_ID,
        templateId: 'NURSING_HANDOFF_V1',
        includeUnverified: true,
        requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        maxAttempts: 3,
      }),
    );
  });

  it('수정 시 기존 연결 task는 보존하고 새 task만 TaskQueryPort로 검증한다', async () => {
    const repository = createRepository();
    repository.get.mockResolvedValueOnce(draftDetail());
    const tasks = createTasks();
    const newTaskId = '10000000-0000-4000-8000-000000000102';
    tasks.findIncompleteByPatients.mockResolvedValueOnce([
      { ...draftDetail().draft!.tasks[0], id: newTaskId },
    ]);
    const service = createService(repository, createPrechecks(), tasks);

    await service.update(CONTEXT, HANDOFF_ID, {
      patients: [{ patientId: PATIENT_ID, sections: sectionRequest() }],
      taskIds: [TASK_ID, newTaskId],
      version: 1,
    });

    expect(tasks.findIncompleteByPatients).toHaveBeenCalledWith(CONTEXT, [
      PATIENT_ID,
    ]);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [
          expect.objectContaining({ id: TASK_ID }),
          expect.objectContaining({ id: newTaskId }),
        ],
        patients: [
          expect.objectContaining({
            sections: expect.objectContaining({
              PATIENT_STATUS: '환자 상태',
              DIET: '식이',
              ACTIVITY: '활동',
            }),
          }),
        ],
      }),
    );
  });
});

function createService(
  repository = createRepository(),
  prechecks = createPrechecks(),
  tasks = createTasks(),
) {
  return new HandoffDraftsService(
    repository,
    prechecks,
    tasks,
    new FixedClock(),
  );
}

function createRepository(): jest.Mocked<HandoffDraftRepository> {
  return {
    findReplay: jest.fn().mockResolvedValue(null),
    reserve: jest.fn().mockResolvedValue({
      resourceId: HANDOFF_ID,
      jobId: JOB_ID,
      isReplay: false,
    }),
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    get: jest.fn().mockResolvedValue(draftDetail()),
    update: jest.fn().mockResolvedValue({
      handoffId: HANDOFF_ID,
      status: 'DRAFT',
      version: 2,
      updatedAt: NOW,
    }),
    getWork: jest.fn(),
    publishResult: jest.fn(),
  };
}

function createPrechecks(): jest.Mocked<HandoffPrecheckRepository> {
  return {
    resolveShiftScope: jest.fn(),
    findReplay: jest.fn(),
    reserve: jest.fn(),
    get: jest.fn().mockResolvedValue(precheckDetail('NO_ISSUE')),
    answerItem: jest.fn(),
    getWork: jest.fn(),
    publishResult: jest.fn(),
  };
}

function createTasks(): jest.Mocked<TaskQueryPort> {
  return { findIncompleteByPatients: jest.fn().mockResolvedValue([]) };
}

function precheckDetail(answer: 'NO_ISSUE' | null) {
  return {
    precheckId: PRECHECK_ID,
    version: 2,
    job: {
      jobId: JOB_ID,
      status: 'SUCCEEDED' as const,
      failureCode: null,
      retryable: null,
    },
    modelVersion: 'model-v1',
    contractVersion: 'handoff-precheck-v1',
    generatedAt: NOW,
    items: [
      {
        itemId: ITEM_ID,
        patientId: PATIENT_ID,
        severity: 'CRITICAL' as const,
        question: '확인해 주세요.',
        reason: '근거가 있습니다.',
        evidence: [],
        answer,
        comment: null,
        version: 1,
      },
    ],
  };
}

function draftDetail(): HandoffDraftDetail {
  return {
    handoffId: HANDOFF_ID,
    status: 'DRAFT',
    version: 1,
    date: '2026-08-18',
    senderActorId: ACTOR_ID,
    receiverActorId: RECEIVER_ID,
    generationJob: {
      jobId: JOB_ID,
      status: 'SUCCEEDED',
      failureCode: null,
      retryable: null,
    },
    draft: {
      templateId: 'NURSING_HANDOFF_V1',
      includeUnverified: false,
      patients: [],
      tasks: [
        {
          id: TASK_ID,
          patientId: PATIENT_ID,
          title: '기존 업무',
          dueAt: null,
          effectivePriority: 'HIGH',
          version: 1,
          sourceReferences: ['task:901'],
          updatedAt: NOW,
        },
      ],
      warnings: [],
    },
    updatedAt: NOW,
  };
}

function sectionRequest() {
  return {
    patientStatus: '환자 상태',
    pain: '통증',
    treatment: '치료',
    diet: '식이',
    activity: '활동',
    observation: '관찰',
  };
}
