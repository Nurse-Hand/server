import { Prisma } from '../../../generated/prisma/client';

type FirstViewClient = Pick<Prisma.TransactionClient, 'handoffAuditEvent'>;

export async function appendFirstHandoffView(
  client: FirstViewClient,
  input: {
    datasetId: string;
    wardId: string;
    handoffId: string;
    senderActorId: string;
    receiverActorId: string;
    actorId: string;
    viewedAt: Date;
  },
): Promise<void> {
  if (input.actorId !== input.receiverActorId) return;
  await client.handoffAuditEvent.createMany({
    data: [
      {
        datasetId: input.datasetId,
        wardId: input.wardId,
        handoffId: input.handoffId,
        senderActorId: input.senderActorId,
        receiverActorId: input.receiverActorId,
        actorId: input.actorId,
        eventType: 'FIRST_VIEWED',
        deduplicationKey: `first-viewed:${input.receiverActorId}`,
        eventPayload: Prisma.JsonNull,
        occurredAt: input.viewedAt,
        createdAt: input.viewedAt,
      },
    ],
    skipDuplicates: true,
  });
}
