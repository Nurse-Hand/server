import { mapRoundingSessionDto } from './rounding-session.dto';

describe('mapRoundingSessionDto', () => {
  it('라운딩 세션 read model을 공개 응답 DTO로 변환한다', () => {
    const dto = mapRoundingSessionDto({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'COMPLETED',
      actorId: '22222222-2222-4222-8222-222222222222',
      wardId: '33333333-3333-4333-8333-333333333333',
      startedAt: new Date('2026-08-19T00:00:00.000Z'),
      completedAt: new Date('2026-08-19T00:30:00.000Z'),
      note: null,
      version: 2,
      segments: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          patientId: '55555555-5555-4555-8555-555555555555',
          sequence: 1,
          startedAt: new Date('2026-08-19T00:01:00.000Z'),
          endedAt: new Date('2026-08-19T00:05:00.000Z'),
          note: '호흡 확인',
        },
      ],
    });

    expect(dto).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'COMPLETED',
      actorId: '22222222-2222-4222-8222-222222222222',
      wardId: '33333333-3333-4333-8333-333333333333',
      startedAt: '2026-08-19T00:00:00.000Z',
      completedAt: '2026-08-19T00:30:00.000Z',
      note: null,
      version: 2,
      segments: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          patientId: '55555555-5555-4555-8555-555555555555',
          sequence: 1,
          startedAt: '2026-08-19T00:01:00.000Z',
          endedAt: '2026-08-19T00:05:00.000Z',
          note: '호흡 확인',
        },
      ],
    });
  });
});
