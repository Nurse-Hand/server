import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { FinalizeHandoffCommand } from '../application/handoff-finalization.models';
import { PrismaHandoffFinalizationRepository } from './prisma-handoff-finalization.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const RECEIVER_ID = '00000000-0000-4000-8000-000000000202';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const ITEM_ID = '00000000-0000-4000-8000-000000000701';
const EVENT_ID = '00000000-0000-4000-8000-000000000801';
const TASK_ID = '00000000-0000-4000-8000-000000000802';
const NOW = new Date('2026-08-19T03:00:00.000Z');

describe('PrismaHandoffFinalizationRepository', () => {
  let transaction: ReturnType<typeof createTransaction>;
  let prisma: ReturnType<typeof createPrisma>;
  let repository: PrismaHandoffFinalizationRepository;

  beforeEach(() => {
    transaction = createTransaction();
    prisma = createPrisma(transaction);
    repository = new PrismaHandoffFinalizationRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('한 transaction에서 6개 section과 근거·답변·warning·task snapshot을 만들고 FINALIZED로 전이한다', async () => {
    const result = await repository.finalize(command());

    expect(result).toEqual({
      handoffId: HANDOFF_ID,
      status: 'FINALIZED',
      finalizedAt: NOW,
      version: 3,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.aiJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
    );
    const snapshotData =
      transaction.handoffFinalSnapshot.create.mock.calls[0]![0].data;
    expect(snapshotData).toMatchObject({
      handoffId: HANDOFF_ID,
      finalizedByActorId: ACTOR_ID,
      resolution: 'KEEP_WITH_WARNING',
      sourceDraftVersion: 2,
      precheckVersion: 4,
      templateKey: 'NURSING_HANDOFF_V1',
      includeUnverified: false,
      requestHash: 'request-hash',
      snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(snapshotData.snapshotPayload).toMatchObject({
      snapshotVersion: 1,
      sourceDraftVersion: 2,
      unverifiedHandling: 'KEEP_WITH_WARNING',
      patients: [
        {
          patientId: PATIENT_ID,
          sections: expect.arrayContaining([
            expect.objectContaining({
              section: 'PATIENT_STATUS',
              aiOriginalContent: 'AI 환자 상태',
              currentContent: '간호사 수정 환자 상태',
              isModified: true,
              citations: [
                expect.objectContaining({
                  sourceId: EVENT_ID,
                  sourceReference: 'timeline:status',
                  occurredAt: '2026-08-19T01:00:00.000Z',
                  excerptKind: 'SUMMARY',
                  excerpt: '통증 호소',
                }),
              ],
            }),
          ]),
        },
      ],
      tasks: [
        expect.objectContaining({
          taskId: TASK_ID,
          title: '투약 확인',
          dueAt: '2026-08-19T04:00:00.000Z',
          sourceReferences: ['task:medication'],
        }),
      ],
      precheckItems: [
        expect.objectContaining({
          itemId: ITEM_ID,
          answer: 'UNVERIFIED',
          comment: '확인 필요',
          evidence: [
            expect.objectContaining({
              sourceId: EVENT_ID,
              excerptKind: 'SUMMARY',
            }),
          ],
        }),
      ],
      warnings: [
        expect.objectContaining({
          itemId: ITEM_ID,
          warningType: 'UNVERIFIED',
          isIncludedInAiInput: false,
        }),
      ],
      finalizedByActorId: ACTOR_ID,
      finalizedAt: NOW.toISOString(),
    });
    expect(transaction.handoff.updateMany).toHaveBeenCalledWith({
      where: {
        id: HANDOFF_ID,
        datasetId: DATASET_ID,
        wardId: WARD_ID,
        senderActorId: ACTOR_ID,
        status: 'DRAFT',
        version: 2,
      },
      data: {
        status: 'FINALIZED',
        finalizedAt: NOW,
        version: { increment: 1 },
        updatedAt: NOW,
      },
    });
    expect(transaction.handoffAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'FINALIZED',
        eventPayload: expect.objectContaining({
          unverifiedHandling: 'KEEP_WITH_WARNING',
          warningItemIds: [ITEM_ID],
        }),
      }),
    });
    expect(transaction.idempotencyRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'idempotency-id',
        datasetId: DATASET_ID,
        status: 'PROCESSING',
      },
      data: {
        status: 'COMPLETED',
        resultReference: HANDOFF_ID,
        updatedAt: NOW,
      },
    });
  });

  it('다른 dataset/ward/actor scope는 row lock 단계에서 동일한 404로 숨긴다', async () => {
    transaction.$queryRaw.mockResolvedValueOnce([]);

    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'HANDOFF_NOT_FOUND',
      kind: 'NOT_FOUND',
    });
    expect(transaction.handoff.findFirst).not.toHaveBeenCalled();
    expect(transaction.handoffFinalSnapshot.create).not.toHaveBeenCalled();
  });

  it('모든 질문이 답변되고 UNVERIFIED가 없으면 RESOLVED snapshot을 만든다', async () => {
    transaction.handoff.findFirst.mockResolvedValueOnce(
      handoffFixture({ answerCode: 'NO_ISSUE' }),
    );

    await expect(
      repository.finalize({
        ...command(),
        unverifiedHandling: 'RESOLVED',
        requestHash: 'resolved-request-hash',
      }),
    ).resolves.toMatchObject({ status: 'FINALIZED' });
    expect(
      transaction.handoffFinalSnapshot.create.mock.calls[0]![0].data
        .snapshotPayload,
    ).toMatchObject({
      unverifiedHandling: 'RESOLVED',
      warnings: [],
    });
  });

  it('stale version은 snapshot 생성 전에 409로 거부한다', async () => {
    transaction.handoff.findFirst.mockResolvedValueOnce(
      handoffFixture({ version: 3 }),
    );

    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      kind: 'CONFLICT',
    });
    expect(transaction.handoffFinalSnapshot.create).not.toHaveBeenCalled();
  });

  it('DRAFT와 성공 generation job 조건을 모두 검사한다', async () => {
    transaction.handoff.findFirst.mockResolvedValueOnce(
      handoffFixture({ status: 'GENERATING' }),
    );
    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'HANDOFF_STATE_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
    });

    transaction.handoff.findFirst.mockResolvedValueOnce(handoffFixture());
    transaction.aiJob.findFirst.mockResolvedValueOnce(null);
    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'HANDOFF_STATE_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
    });
  });

  it('DB의 CRITICAL 미응답은 KEEP_WITH_WARNING으로도 우회하지 못한다', async () => {
    transaction.handoff.findFirst.mockResolvedValueOnce(
      handoffFixture({ severity: 'CRITICAL', answerCode: null }),
    );

    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'HANDOFF_CRITICAL_ANSWER_REQUIRED',
      kind: 'UNPROCESSABLE_ENTITY',
    });
    expect(transaction.handoffFinalSnapshot.create).not.toHaveBeenCalled();
  });

  it('경고 대상이 없으면 KEEP_WITH_WARNING을 거부한다', async () => {
    transaction.handoff.findFirst.mockResolvedValueOnce(
      handoffFixture({ answerCode: 'NO_ISSUE' }),
    );

    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'HANDOFF_UNVERIFIED_POLICY_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
    });
  });

  it('조건부 root update가 실패하면 뒤의 audit과 idempotency 완료를 실행하지 않는다', async () => {
    transaction.handoff.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      kind: 'CONFLICT',
    });
    expect(transaction.handoffFinalSnapshot.create).toHaveBeenCalledTimes(1);
    expect(transaction.handoffAuditEvent.create).not.toHaveBeenCalled();
    expect(transaction.idempotencyRecord.updateMany).not.toHaveBeenCalled();
  });

  it('동일 key와 동일 canonical hash는 완료 결과를 replay한다', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValueOnce({
      wardId: WARD_ID,
      requestHash: 'request-hash',
      status: 'COMPLETED',
      resultReference: HANDOFF_ID,
    });
    prisma.handoff.findFirst.mockResolvedValueOnce({
      id: HANDOFF_ID,
      finalizedAt: NOW,
      version: 3,
    });

    await expect(repository.finalize(command())).resolves.toEqual({
      handoffId: HANDOFF_ID,
      status: 'FINALIZED',
      finalizedAt: NOW,
      version: 3,
    });
  });

  it('동일 key의 다른 요청 hash는 409로 거부한다', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValueOnce({
      wardId: WARD_ID,
      requestHash: 'different-hash',
      status: 'COMPLETED',
      resultReference: HANDOFF_ID,
    });

    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      kind: 'CONFLICT',
    });
    expect(prisma.handoff.findFirst).not.toHaveBeenCalled();
  });

  it('다른 key의 동시 finalize가 snapshot unique를 선점하면 optimistic conflict로 처리한다', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValueOnce(null);

    await expect(repository.finalize(command())).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      kind: 'CONFLICT',
    });
  });
});

function command(): FinalizeHandoffCommand {
  return {
    context: { datasetId: DATASET_ID, actorId: ACTOR_ID, wardId: WARD_ID },
    handoffId: HANDOFF_ID,
    version: 2,
    unverifiedHandling: 'KEEP_WITH_WARNING',
    idempotencyKey: 'finalize-key',
    requestHash: 'request-hash',
    requestId: '00000000-0000-4000-8000-000000000901',
    now: NOW,
  };
}

function handoffFixture(
  overrides: {
    version?: number;
    status?: 'GENERATING' | 'DRAFT' | 'FINALIZED';
    severity?: 'CRITICAL' | 'RECOMMENDED';
    answerCode?:
      'NO_ISSUE' | 'INCLUDE_HANDOFF' | 'UNVERIFIED' | 'NOT_APPLICABLE' | null;
  } = {},
) {
  const sections = [
    'PATIENT_STATUS',
    'PAIN',
    'TREATMENT',
    'DIET',
    'ACTIVITY',
    'OBSERVATION',
  ] as const;
  return {
    id: HANDOFF_ID,
    datasetId: DATASET_ID,
    wardId: WARD_ID,
    senderActorId: ACTOR_ID,
    receiverActorId: RECEIVER_ID,
    status: overrides.status ?? ('DRAFT' as const),
    version: overrides.version ?? 2,
    precheckVersion: 4,
    templateKey: 'NURSING_HANDOFF_V1',
    includeUnverified: false,
    frozenInputPayload: {
      capturedAt: '2026-08-19T02:00:00.000Z',
      patients: [
        {
          patientId: PATIENT_ID,
          timelineEvents: [
            {
              id: EVENT_ID,
              patientId: PATIENT_ID,
              occurredAt: '2026-08-19T01:00:00.000Z',
              summary: '통증 호소',
              sourceReference: 'timeline:status',
            },
          ],
        },
      ],
      tasks: [
        {
          id: TASK_ID,
          patientId: PATIENT_ID,
          title: '투약 확인',
          dueAt: '2026-08-19T04:00:00.000Z',
          effectivePriority: 'HIGH',
          version: 5,
          sourceReferences: ['task:medication'],
          updatedAt: '2026-08-19T02:30:00.000Z',
        },
      ],
    },
    generationAttempts: [{ aiJobId: '00000000-0000-4000-8000-000000000902' }],
    frozenPrecheckItems: [
      {
        id: 'frozen-item-id',
        sourcePrecheckItemId: ITEM_ID,
        severity: overrides.severity ?? ('RECOMMENDED' as const),
        aiQuestion: JSON.stringify({
          patientId: PATIENT_ID,
          question: '통증을 확인했나요?',
          reason: '최근 통증 기록',
        }),
        answerCode:
          overrides.answerCode === undefined
            ? ('UNVERIFIED' as const)
            : overrides.answerCode,
        answerComment: '확인 필요',
        answeredByActorId: ACTOR_ID,
        answeredAt: NOW,
        sourceItemVersion: 2,
        sourceAnswerVersion: 1,
        evidence: [
          {
            id: 'frozen-evidence-id',
            sourceType: 'TIMELINE_EVENT' as const,
            sourceId: EVENT_ID,
          },
        ],
      },
    ],
    draftPatients: [
      {
        id: 'draft-patient-id',
        patientId: PATIENT_ID,
        sections: sections.map((section) => ({
          id: `section-${section}`,
          section,
          aiOriginalText:
            section === 'PATIENT_STATUS' ? 'AI 환자 상태' : `AI ${section}`,
          currentText:
            section === 'PATIENT_STATUS'
              ? '간호사 수정 환자 상태'
              : `AI ${section}`,
          isModified: section === 'PATIENT_STATUS',
          citations:
            section === 'PATIENT_STATUS'
              ? [
                  {
                    id: 'citation-id',
                    sourceType: 'TIMELINE_EVENT' as const,
                    sourceId: EVENT_ID,
                  },
                ]
              : [],
        })),
      },
    ],
    draftTasks: [
      {
        id: 'draft-task-id',
        taskId: TASK_ID,
        patientId: PATIENT_ID,
        title: '투약 확인',
        dueAt: new Date('2026-08-19T04:00:00.000Z'),
        effectivePriority: 'HIGH' as const,
        sourceVersion: 5,
        sourceUpdatedAt: new Date('2026-08-19T02:30:00.000Z'),
        sourceReferences: [{ reference: 'task:medication' }],
      },
    ],
    draftWarnings: [
      {
        id: 'warning-id',
        precheckItemId: ITEM_ID,
        warningType: 'UNVERIFIED' as const,
        message: JSON.stringify({ question: '통증을 확인했나요?' }),
        isIncludedInAiInput: false,
        createdAt: NOW,
      },
    ],
  };
}

function createTransaction() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: HANDOFF_ID }]),
    idempotencyRecord: {
      create: jest.fn().mockResolvedValue({ id: 'idempotency-id' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    handoff: {
      findFirst: jest.fn().mockResolvedValue(handoffFixture()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    aiJob: { findFirst: jest.fn().mockResolvedValue({ id: 'job-id' }) },
    handoffFinalSnapshot: {
      create: jest.fn().mockResolvedValue({ id: 'snapshot-id' }),
    },
    handoffAuditEvent: {
      create: jest.fn().mockResolvedValue({ id: 'audit-id' }),
    },
  };
}

function createPrisma(transaction: ReturnType<typeof createTransaction>) {
  return {
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    idempotencyRecord: { findUnique: jest.fn() },
    handoff: { findFirst: jest.fn() },
  };
}
