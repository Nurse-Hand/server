import { IdempotencyKeyReusedError } from '../../../common/idempotency/idempotency.errors';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  HandoffAcknowledgementDuplicateError,
  HandoffAcknowledgementTransitionError,
  HandoffNotFoundError,
  HandoffStateInvalidError,
} from '../domain/handoff.errors';
import { PrismaHandoffActivityRepository } from './prisma-handoff-activity.repository';

const NOW = new Date('2026-08-19T03:00:00.000Z');
const CONTEXT = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000202',
  wardId: '00000000-0000-4000-8000-000000000301',
};
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const ACK_ID = '00000000-0000-4000-8000-000000000701';
const SENDER_ID = '00000000-0000-4000-8000-000000000201';

function command(status: 'QUESTIONED' | 'ACKNOWLEDGED' = 'QUESTIONED') {
  return {
    context: CONTEXT,
    handoffId: HANDOFF_ID,
    status,
    comment: null,
    idempotencyKey: `key-${status}`,
    requestHash: `hash-${status}`,
    requestId: ACK_ID,
    now: NOW,
  };
}

function fixture(
  latest: 'QUESTIONED' | 'ACKNOWLEDGED' | null = null,
  handoffStatus = 'FINALIZED',
  snapshot: object | null = { id: ACK_ID },
) {
  const tx = {
    idempotencyRecord: {
      create: jest.fn().mockResolvedValue({ id: ACK_ID }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: HANDOFF_ID }]),
    handoff: {
      findFirst: jest.fn().mockResolvedValue({
        id: HANDOFF_ID,
        status: handoffStatus,
        senderActorId: SENDER_ID,
        receiverActorId: CONTEXT.actorId,
        finalSnapshot: snapshot,
        acknowledgements: latest ? [{ status: latest }] : [],
      }),
    },
    handoffAcknowledgement: {
      create: jest.fn().mockResolvedValue({
        id: ACK_ID,
        status: 'QUESTIONED',
        createdAt: NOW,
      }),
    },
    handoffAuditEvent: {
      create: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(tx)),
    idempotencyRecord: { findUnique: jest.fn() },
    handoffAcknowledgement: { findFirst: jest.fn() },
  };
  return {
    tx,
    prisma,
    repository: new PrismaHandoffActivityRepository(
      prisma as unknown as PrismaService,
    ),
  };
}

describe('PrismaHandoffActivityRepository', () => {
  it('최초 QUESTIONED와 audit/idempotency를 한 transaction에 append한다', async () => {
    const { repository, tx } = fixture();
    const result = await repository.acknowledge(command());
    expect(result).toEqual({
      acknowledgementId: ACK_ID,
      status: 'QUESTIONED',
      acknowledgedAt: NOW,
    });
    expect(tx.handoffAcknowledgement.create).toHaveBeenCalledTimes(1);
    expect(tx.handoffAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'QUESTIONED',
        acknowledgementId: ACK_ID,
      }),
    });
    expect(tx.idempotencyRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          resultReference: ACK_ID,
        }),
      }),
    );
  });

  it('QUESTIONED에서 ACKNOWLEDGED 전이를 허용한다', async () => {
    const { repository, tx } = fixture('QUESTIONED');
    tx.handoffAcknowledgement.create.mockResolvedValue({
      id: ACK_ID,
      status: 'ACKNOWLEDGED',
      createdAt: NOW,
    });
    await expect(
      repository.acknowledge(command('ACKNOWLEDGED')),
    ).resolves.toMatchObject({ status: 'ACKNOWLEDGED' });
  });

  it('ACKNOWLEDGED 이후 QUESTIONED를 422로 거부한다', async () => {
    const { repository } = fixture('ACKNOWLEDGED');
    await expect(repository.acknowledge(command())).rejects.toBeInstanceOf(
      HandoffAcknowledgementTransitionError,
    );
  });

  it('다른 key의 같은 status를 409로 거부한다', async () => {
    const { repository } = fixture('QUESTIONED');
    await expect(repository.acknowledge(command())).rejects.toBeInstanceOf(
      HandoffAcknowledgementDuplicateError,
    );
  });

  it('receiver scope 밖 handoff와 final snapshot 없는 root를 숨기거나 거부한다', async () => {
    const missing = fixture();
    missing.tx.$queryRaw.mockResolvedValue([]);
    await expect(
      missing.repository.acknowledge(command()),
    ).rejects.toBeInstanceOf(HandoffNotFoundError);
    await expect(
      fixture(null, 'FINALIZED', null).repository.acknowledge(command()),
    ).rejects.toBeInstanceOf(HandoffStateInvalidError);
  });

  it('같은 key/body는 replay하고 다른 body는 409다', async () => {
    const replay = fixture();
    replay.prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    replay.prisma.idempotencyRecord.findUnique.mockResolvedValue({
      wardId: CONTEXT.wardId,
      requestHash: command().requestHash,
      status: 'COMPLETED',
      resultReference: ACK_ID,
    });
    replay.prisma.handoffAcknowledgement.findFirst.mockResolvedValue({
      id: ACK_ID,
      status: 'QUESTIONED',
      createdAt: NOW,
    });
    await expect(
      replay.repository.acknowledge(command()),
    ).resolves.toMatchObject({ acknowledgementId: ACK_ID });
    replay.prisma.idempotencyRecord.findUnique.mockResolvedValue({
      wardId: CONTEXT.wardId,
      requestHash: 'other',
      status: 'COMPLETED',
      resultReference: ACK_ID,
    });
    await expect(
      replay.repository.acknowledge(command()),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it('history를 bounded query와 안정 cursor로 조회하고 임의 metadata를 제거한다', async () => {
    const { repository, tx } = fixture();
    tx.handoffAuditEvent.findMany.mockResolvedValue([
      {
        id: ACK_ID,
        eventType: 'FINALIZED',
        actorId: SENDER_ID,
        occurredAt: NOW,
        eventPayload: {
          version: 3,
          requestId: 'secret',
          warningItemIds: [ACK_ID],
        },
      },
    ]);
    const result = await repository.history({
      context: CONTEXT,
      handoffId: HANDOFF_ID,
      limit: 1,
      viewedAt: NOW,
    });
    expect(result.items[0]).toMatchObject({
      type: 'FINALIZED',
      metadata: { version: 3, warningItemIds: [ACK_ID] },
    });
    expect(result.items[0]?.metadata).not.toHaveProperty('requestId');
    expect(tx.handoff.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.handoffAuditEvent.createMany).toHaveBeenCalledTimes(1);
    expect(tx.handoffAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: 2,
      }),
    );
  });
});
