import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RoundingSessionNotFoundError } from '../domain/rounding.errors';
import { PrismaRoundingSessionQueryAdapter } from './prisma-rounding-session-query.adapter';

const CONTEXT = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};
const SESSION_ID = '00000000-0000-4000-8000-000000000401';
const RECORD_ID_A = '00000000-0000-4000-8000-000000000501';
const RECORD_ID_B = '00000000-0000-4000-8000-000000000502';

describe('PrismaRoundingSessionQueryAdapter', () => {
  const findFirst = jest.fn();
  const adapter = new PrismaRoundingSessionQueryAdapter({
    roundingSession: { findFirst },
  } as unknown as PrismaService);

  beforeEach(() => {
    findFirst.mockReset();
  });

  it('같은 scope의 COMPLETED 세션과 모든 record ID를 한 조회로 검증한다', async () => {
    findFirst.mockResolvedValue({
      id: SESSION_ID,
      segments: [{ id: RECORD_ID_A }, { id: RECORD_ID_B }],
    });

    await expect(
      adapter.assertCompleted({
        context: CONTEXT,
        roundingSessionId: SESSION_ID,
        recordIds: [RECORD_ID_A, RECORD_ID_B],
      }),
    ).resolves.toBeUndefined();

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: SESSION_ID,
        datasetId: CONTEXT.datasetId,
        actorId: CONTEXT.actorId,
        wardId: CONTEXT.wardId,
        status: 'COMPLETED',
      },
      select: {
        id: true,
        segments: {
          where: { id: { in: [RECORD_ID_A, RECORD_ID_B] } },
          select: { id: true },
        },
      },
    });
  });

  it.each([
    ['scope 또는 상태가 맞지 않는 경우', null],
    [
      'record ID 일부가 세션에 속하지 않는 경우',
      { id: SESSION_ID, segments: [{ id: RECORD_ID_A }] },
    ],
  ])('%s 404 경계로 숨긴다', async (_label, result) => {
    findFirst.mockResolvedValue(result);

    await expect(
      adapter.assertCompleted({
        context: CONTEXT,
        roundingSessionId: SESSION_ID,
        recordIds: [RECORD_ID_A, RECORD_ID_B],
      }),
    ).rejects.toBeInstanceOf(RoundingSessionNotFoundError);
  });
});
