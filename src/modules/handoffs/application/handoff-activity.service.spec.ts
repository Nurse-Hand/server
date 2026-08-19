import type { Clock } from '../../../common/time/clock';
import { HandoffCursorInvalidError } from '../domain/handoff.errors';
import { encodeHandoffHistoryCursor } from '../domain/handoff-history-cursor';
import { HandoffActivityService } from './handoff-activity.service';
import type { HandoffActivityRepository } from './ports/handoff-activity.repository';

const NOW = new Date('2026-08-19T03:00:00.000Z');
const ID = '00000000-0000-4000-8000-000000000601';
const EVENT_ID = '00000000-0000-4000-8000-000000000701';
const CONTEXT = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};

describe('HandoffActivityService', () => {
  const repository = { acknowledge: jest.fn(), history: jest.fn() };
  const service = new HandoffActivityService(
    repository as unknown as HandoffActivityRepository,
    { now: () => NOW } as Clock,
  );

  beforeEach(() => jest.clearAllMocks());

  it('comment null을 canonical hash에 고정해 acknowledgement를 위임한다', async () => {
    repository.acknowledge.mockResolvedValue({
      acknowledgementId: EVENT_ID,
      status: 'QUESTIONED',
      acknowledgedAt: NOW,
    });
    await service.acknowledge(
      CONTEXT,
      ID,
      { status: 'QUESTIONED' },
      'key-1',
      EVENT_ID,
    );
    expect(repository.acknowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        context: CONTEXT,
        handoffId: ID,
        status: 'QUESTIONED',
        comment: null,
        idempotencyKey: 'key-1',
        requestId: EVENT_ID,
        now: NOW,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('history cursor와 기본 limit을 검증해 위임한다', async () => {
    repository.history.mockResolvedValue({ items: [], nextCursor: null });
    const cursor = encodeHandoffHistoryCursor({
      occurredAt: NOW,
      id: EVENT_ID,
    });
    await service.history(CONTEXT, ID, { cursor });
    expect(repository.history).toHaveBeenCalledWith({
      context: CONTEXT,
      handoffId: ID,
      cursor: { occurredAt: NOW, id: EVENT_ID },
      limit: 20,
      viewedAt: NOW,
    });
  });

  it('비정규 history cursor를 400 code와 kind로 거부한다', () => {
    expect(() => service.history(CONTEXT, ID, { cursor: 'invalid' })).toThrow(
      HandoffCursorInvalidError,
    );
    try {
      service.history(CONTEXT, ID, { cursor: 'invalid' });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'HANDOFF_CURSOR_INVALID',
        kind: 'BAD_REQUEST',
      });
    }
  });
});
