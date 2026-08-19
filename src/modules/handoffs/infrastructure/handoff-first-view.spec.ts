import { appendFirstHandoffView } from './handoff-first-view';

const INPUT = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  wardId: '00000000-0000-4000-8000-000000000301',
  handoffId: '00000000-0000-4000-8000-000000000601',
  senderActorId: '00000000-0000-4000-8000-000000000201',
  receiverActorId: '00000000-0000-4000-8000-000000000202',
  actorId: '00000000-0000-4000-8000-000000000202',
  viewedAt: new Date('2026-08-19T03:00:00.000Z'),
};

describe('appendFirstHandoffView', () => {
  it('receiver view를 unique dedup key와 skipDuplicates로 append한다', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await appendFirstHandoffView(
      { handoffAuditEvent: { createMany } } as never,
      INPUT,
    );
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            eventType: 'FIRST_VIEWED',
            deduplicationKey: `first-viewed:${INPUT.receiverActorId}`,
          }),
        ],
      }),
    );
  });

  it('sender view는 기록하지 않는다', async () => {
    const createMany = jest.fn();
    await appendFirstHandoffView(
      { handoffAuditEvent: { createMany } } as never,
      { ...INPUT, actorId: INPUT.senderActorId },
    );
    expect(createMany).not.toHaveBeenCalled();
  });
});
