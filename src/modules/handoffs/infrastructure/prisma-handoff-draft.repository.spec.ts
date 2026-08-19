import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PrismaHandoffDraftRepository } from './prisma-handoff-draft.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const RECEIVER_ID = '00000000-0000-4000-8000-000000000202';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const PRECHECK_ID = '00000000-0000-4000-8000-000000000501';
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const JOB_ID = '00000000-0000-4000-8000-000000000701';
const EVENT_ID = '00000000-0000-4000-8000-000000000801';
const ITEM_ID = '00000000-0000-4000-8000-000000000901';
const NOW = new Date('2026-08-18T02:00:00.000Z');
const CONTEXT = { datasetId: DATASET_ID, actorId: ACTOR_ID, wardId: WARD_ID };

describe('PrismaHandoffDraftRepository', () => {
  it('목록은 GENERATING을 제외하고 updatedAt DESC,id DESC cursor를 한 query로 조회한다', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: HANDOFF_ID,
        status: 'DRAFT',
        updatedAt: NOW,
        _count: { draftPatients: 1, draftTasks: 2 },
      },
    ]);
    const repository = new PrismaHandoffDraftRepository({
      handoff: { findMany },
    } as unknown as PrismaService);

    await expect(
      repository.list({ context: CONTEXT, limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          handoffId: HANDOFF_ID,
          status: 'DRAFT',
          patientCount: 1,
          taskCount: 2,
          updatedAt: NOW,
        },
      ],
      nextCursor: null,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['DRAFT', 'FINALIZED'] },
        }),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('상세는 bounded 2 queries로 job과 Timeline SUMMARY excerpt를 projection한다', async () => {
    const findHandoff = jest.fn().mockResolvedValue(draftRow());
    const findJob = jest.fn().mockResolvedValue({
      id: JOB_ID,
      status: 'SUCCEEDED',
      failureCode: null,
      retryable: null,
    });
    const repository = new PrismaHandoffDraftRepository({
      handoff: { findFirst: findHandoff },
      aiJob: { findFirst: findJob },
    } as unknown as PrismaService);

    const result = await repository.get(CONTEXT, HANDOFF_ID, NOW);

    expect(findHandoff).toHaveBeenCalledTimes(1);
    expect(findJob).toHaveBeenCalledTimes(1);
    expect(result.draft?.patients[0].sections[0].citations).toEqual([
      {
        sourceType: 'TIMELINE_EVENT',
        sourceId: EVENT_ID,
        sourceReference: 'timeline:event:801',
        occurredAt: NOW,
        excerptKind: 'SUMMARY',
        excerpt: '체온 상승 관찰',
      },
    ]);
  });

  it('수신자의 FINALIZED 상세 최초 열람을 unique append로 기록한다', async () => {
    const row = {
      ...draftRow(),
      status: 'FINALIZED',
      finalSnapshot: { id: ITEM_ID },
    };
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaHandoffDraftRepository({
      handoff: { findFirst: jest.fn().mockResolvedValue(row) },
      aiJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: JOB_ID,
          status: 'SUCCEEDED',
          failureCode: null,
          retryable: null,
        }),
      },
      handoffAuditEvent: { createMany },
    } as unknown as PrismaService);

    await repository.get({ ...CONTEXT, actorId: RECEIVER_ID }, HANDOFF_ID, NOW);

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            eventType: 'FIRST_VIEWED',
            deduplicationKey: `first-viewed:${RECEIVER_ID}`,
          }),
        ],
      }),
    );
  });

  it('reservation transaction에서 CRITICAL 미응답을 다시 읽어 422로 거부한다', async () => {
    const transaction = {
      idempotencyRecord: {
        create: jest.fn().mockResolvedValue({
          id: '10000000-0000-4000-8000-000000000101',
        }),
      },
      aiJob: {
        create: jest.fn().mockResolvedValue({ id: JOB_ID }),
        findFirst: jest.fn().mockResolvedValue({ id: JOB_ID }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: PRECHECK_ID }]),
      handoffPrecheck: {
        findFirst: jest.fn().mockResolvedValue({
          id: PRECHECK_ID,
          aiJobId: JOB_ID,
          items: [
            {
              id: ITEM_ID,
              severity: 'CRITICAL',
              answer: null,
              evidence: [],
            },
          ],
          patientInputs: [],
          timelineInputs: [],
          taskInputs: [],
        }),
      },
    };
    const repository = new PrismaHandoffDraftRepository({
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService);

    await expect(
      repository.reserve({
        context: CONTEXT,
        precheckId: PRECHECK_ID,
        templateId: 'NURSING_HANDOFF_V1',
        includeUnverified: false,
        idempotencyKey: 'generate-key',
        requestHash: 'a'.repeat(64),
        requestId: '10000000-0000-4000-8000-000000000102',
        now: NOW,
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({
      code: 'HANDOFF_CRITICAL_ANSWER_REQUIRED',
      kind: 'UNPROCESSABLE_ENTITY',
    });
    expect(transaction.handoffPrecheck.findFirst).toHaveBeenCalledTimes(1);
  });

  it('DRAFT version 불일치는 section/task write 전에 conflict로 거부한다', async () => {
    const transaction = {
      handoff: {
        findFirst: jest.fn().mockResolvedValue({
          id: HANDOFF_ID,
          status: 'DRAFT',
          version: 3,
          draftPatients: [],
        }),
        updateMany: jest.fn(),
      },
    };
    const repository = new PrismaHandoffDraftRepository({
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService);

    await expect(
      repository.update({
        context: CONTEXT,
        handoffId: HANDOFF_ID,
        version: 2,
        patients: [],
        tasks: [],
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', kind: 'CONFLICT' });
    expect(transaction.handoff.updateMany).not.toHaveBeenCalled();
  });
});

function draftRow() {
  return {
    id: HANDOFF_ID,
    datasetId: DATASET_ID,
    wardId: WARD_ID,
    senderActorId: ACTOR_ID,
    receiverActorId: RECEIVER_ID,
    senderShiftId: '10000000-0000-4000-8000-000000000201',
    receiverShiftId: '10000000-0000-4000-8000-000000000202',
    handoffDate: new Date('2026-08-18T00:00:00.000Z'),
    targetDuty: 'EVENING',
    status: 'DRAFT',
    precheckId: PRECHECK_ID,
    precheckVersion: 2,
    templateKey: 'NURSING_HANDOFF_V1',
    includeUnverified: false,
    frozenInputPayload: {
      capturedAt: NOW.toISOString(),
      patients: [
        {
          patientId: PATIENT_ID,
          timelineEvents: [
            {
              id: EVENT_ID,
              patientId: PATIENT_ID,
              occurredAt: NOW.toISOString(),
              type: 'OBSERVATION',
              source: 'MANUAL',
              summary: '체온 상승 관찰',
              version: 1,
              sourceReference: 'timeline:event:801',
            },
          ],
        },
      ],
      tasks: [],
    },
    frozenInputHash: 'a'.repeat(64),
    version: 2,
    finalizedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    generationAttempts: [{ aiJobId: JOB_ID, sequence: 1 }],
    frozenPrecheckItems: [],
    draftPatients: [
      {
        id: '10000000-0000-4000-8000-000000000301',
        patientId: PATIENT_ID,
        position: 0,
        sections: [
          {
            id: '10000000-0000-4000-8000-000000000401',
            section: 'PATIENT_STATUS',
            aiOriginalText: '환자 상태 원문',
            currentText: '환자 상태 현재본',
            isModified: true,
            citations: [
              {
                sourceType: 'TIMELINE_EVENT',
                sourceId: EVENT_ID,
                position: 0,
              },
            ],
          },
        ],
      },
    ],
    draftTasks: [],
    draftWarnings: [],
    finalSnapshot: null,
  };
}
