import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import { HandoffFinalizationService } from './handoff-finalization.service';
import type { HandoffFinalizationRepository } from './ports/handoff-finalization.repository';

const NOW = new Date('2026-08-19T03:00:00.000Z');
const HANDOFF_ID = '00000000-0000-4000-8000-000000000601';
const CONTEXT = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};

class FixedClock extends Clock {
  now(): Date {
    return NOW;
  }
}

describe('HandoffFinalizationService', () => {
  const repository = {
    finalize: jest.fn().mockResolvedValue({
      handoffId: HANDOFF_ID,
      status: 'FINALIZED',
      finalizedAt: NOW,
      version: 3,
    }),
  } satisfies jest.Mocked<HandoffFinalizationRepository>;
  const service = new HandoffFinalizationService(repository, new FixedClock());

  beforeEach(() => jest.clearAllMocks());

  it('path와 body의 canonical hash를 포함해 finalize command를 위임한다', async () => {
    await expect(
      service.finalize(
        CONTEXT,
        HANDOFF_ID,
        { version: 2, unverifiedHandling: 'KEEP_WITH_WARNING' },
        'finalize-key',
        '00000000-0000-4000-8000-000000000901',
      ),
    ).resolves.toMatchObject({ status: 'FINALIZED', version: 3 });

    expect(repository.finalize).toHaveBeenCalledWith({
      context: CONTEXT,
      handoffId: HANDOFF_ID,
      version: 2,
      unverifiedHandling: 'KEEP_WITH_WARNING',
      idempotencyKey: 'finalize-key',
      requestHash: createCanonicalRequestHash({
        path: { handoffId: HANDOFF_ID },
        query: {},
        body: { unverifiedHandling: 'KEEP_WITH_WARNING', version: 2 },
      }),
      requestId: '00000000-0000-4000-8000-000000000901',
      now: NOW,
    });
  });

  it.each(['', 'x'.repeat(129)])(
    'application 경계에서 잘못된 idempotency key를 거부한다',
    (idempotencyKey) => {
      try {
        service.finalize(
          CONTEXT,
          HANDOFF_ID,
          { version: 2, unverifiedHandling: 'RESOLVED' },
          idempotencyKey,
          '00000000-0000-4000-8000-000000000901',
        );
        throw new Error('잘못된 idempotency key가 거부되어야 합니다.');
      } catch (error) {
        expect(error).toMatchObject({
          code: 'HANDOFF_COMMAND_INVALID',
          kind: 'BAD_REQUEST',
        });
      }
      expect(repository.finalize).not.toHaveBeenCalled();
    },
  );
});
