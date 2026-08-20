import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PrismaTimelineEventRepository } from './prisma-timeline-event.repository';

const CONTEXT = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};

const EVENT_ID = '00000000-0000-4000-8000-000000000401';
const PATIENT_ID = '00000000-0000-4000-8000-000000000402';
const NOW = new Date('2026-08-20T01:00:00.000Z');

describe('PrismaTimelineEventRepository', () => {
  it('PATCH 변경 내용을 저장하고 이력 row를 남긴다', async () => {
    const prisma = createPrisma();
    prisma.transaction.timelineEvent.findFirst
      .mockResolvedValueOnce(
        createEventRow({
          summary: '수술 부위 출혈 없음',
          important: false,
          confirmationStatus: 'PENDING',
          version: 2,
        }),
      )
      .mockResolvedValueOnce(
        createEventRow({
          summary: '수술 부위 출혈 없음, 오후 재확인 필요',
          important: true,
          confirmationStatus: 'CONFIRMED',
          version: 3,
          updatedAt: NOW,
          updatedByActorId: CONTEXT.actorId,
        }),
      );
    prisma.transaction.timelineEvent.updateMany.mockResolvedValue({ count: 1 });
    const repository = new PrismaTimelineEventRepository(
      prisma.root as unknown as PrismaService,
    );

    const result = await repository.update({
      context: CONTEXT,
      eventId: EVENT_ID,
      expectedVersion: 2,
      summary: '수술 부위 출혈 없음, 오후 재확인 필요',
      important: true,
      confirmationStatus: 'CONFIRMED',
      now: NOW,
    });

    expect(prisma.transaction.timelineEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: EVENT_ID,
        datasetId: CONTEXT.datasetId,
        version: 2,
      },
      data: {
        summary: '수술 부위 출혈 없음, 오후 재확인 필요',
        important: true,
        confirmationStatus: 'CONFIRMED',
        updatedByActorId: CONTEXT.actorId,
        updatedAt: NOW,
        version: { increment: 1 },
      },
    });
    expect(prisma.transaction.timelineEventHistory.create).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          datasetId: CONTEXT.datasetId,
          timelineEventId: EVENT_ID,
          actorId: CONTEXT.actorId,
          version: 3,
          previousSummary: '수술 부위 출혈 없음',
          nextSummary: '수술 부위 출혈 없음, 오후 재확인 필요',
          previousImportant: false,
          nextImportant: true,
          previousConfirmationStatus: 'PENDING',
          nextConfirmationStatus: 'CONFIRMED',
        }),
      },
    );
    expect(result).toMatchObject({
      eventId: EVENT_ID,
      patientId: PATIENT_ID,
      summary: '수술 부위 출혈 없음, 오후 재확인 필요',
      important: true,
      confirmationStatus: 'CONFIRMED',
      version: 3,
      updatedByActorId: CONTEXT.actorId,
    });
  });

  it('stale version은 optimistic conflict로 거부한다', async () => {
    const prisma = createPrisma();
    prisma.transaction.timelineEvent.findFirst.mockResolvedValue(
      createEventRow({ version: 4 }),
    );
    const repository = new PrismaTimelineEventRepository(
      prisma.root as unknown as PrismaService,
    );

    await expect(
      repository.update({
        context: CONTEXT,
        eventId: EVENT_ID,
        expectedVersion: 3,
        summary: '변경',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect(prisma.transaction.timelineEvent.updateMany).not.toHaveBeenCalled();
  });

  it('history는 diff가 있는 필드만 반환한다', async () => {
    const prisma = createPrisma();
    prisma.root.timelineEvent.findFirst.mockResolvedValue(createEventRow());
    prisma.root.timelineEventHistory.findMany.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000501',
        actorId: CONTEXT.actorId,
        editedAt: NOW,
        version: 3,
        previousSummary: '기침 호소',
        nextSummary: '야간 기침 지속 호소',
        previousImportant: false,
        nextImportant: true,
        previousConfirmationStatus: 'PENDING',
        nextConfirmationStatus: 'PENDING',
      },
    ]);
    const repository = new PrismaTimelineEventRepository(
      prisma.root as unknown as PrismaService,
    );

    await expect(
      repository.history({ context: CONTEXT, eventId: EVENT_ID, now: NOW }),
    ).resolves.toEqual([
      {
        historyEntryId: '00000000-0000-4000-8000-000000000501',
        actorId: CONTEXT.actorId,
        editedAt: NOW,
        version: 3,
        changes: {
          summary: {
            before: '기침 호소',
            after: '야간 기침 지속 호소',
          },
          important: {
            before: false,
            after: true,
          },
        },
      },
    ]);
  });
});

function createPrisma() {
  const transaction = {
    timelineEvent: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    timelineEventHistory: {
      create: jest.fn(),
    },
  };

  return {
    transaction,
    root: {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      ),
      timelineEvent: { findFirst: jest.fn() },
      timelineEventHistory: { findMany: jest.fn() },
    },
  };
}

function createEventRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: EVENT_ID,
    patientId: PATIENT_ID,
    occurredAt: NOW,
    type: 'OBSERVATION',
    source: 'AI_AUDIO',
    sourceReference: 'timeline:event:801',
    summary: '기침 호소',
    important: false,
    confirmationStatus: 'PENDING',
    version: 2,
    updatedAt: new Date('2026-08-20T00:30:00.000Z'),
    updatedByActorId: null,
    ...overrides,
  };
}
