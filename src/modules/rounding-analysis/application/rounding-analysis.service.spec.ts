import { Clock } from '../../../common/time/clock';
import { RoundingAnalysisService } from './rounding-analysis.service';

const CONTEXT = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-08-20T00:00:00.000Z');
  }
}

describe('RoundingAnalysisService evidence search', () => {
  it('라운딩 evidence와 변환 완료된 빠른기록 evidence를 함께 반환한다', async () => {
    const prisma = {
      roundingEvidence: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000501',
            patientId: '00000000-0000-4000-8000-000000000401',
            topic: 'VITAL_SIGNS',
            handoffSection: '활력징후',
            keywords: ['산소포화도'],
            importanceFlags: [],
            requiresNurseConfirmation: false,
            textForRetrieval: '산소포화도 94%로 재측정 필요',
            timelineEventId: '00000000-0000-4000-8000-000000000601',
            createdAt: new Date('2026-08-20T01:00:00.000Z'),
            utteranceLinks: [
              { utteranceId: '00000000-0000-4000-8000-000000000701' },
            ],
          },
        ]),
      },
      quickNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000801',
            patientId: '00000000-0000-4000-8000-000000000401',
            topic: 'PAIN',
            handoffSection: '통증',
            keywords: ['NRS'],
            structuredFacts: { summary: 'NRS 5점 통증 호소' },
            text: 'NRS 5점 통증 호소',
            occurredAt: new Date('2026-08-20T02:00:00.000Z'),
            createdAt: new Date('2026-08-20T02:00:05.000Z'),
          },
        ]),
      },
      timelineEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000901',
            sourceReference: 'quick-note:00000000-0000-4000-8000-000000000801',
          },
        ]),
      },
    };
    const service = new RoundingAnalysisService(
      prisma as never,
      new FixedClock(),
    );

    await expect(
      service.searchEvidence({
        context: CONTEXT,
        patientId: '00000000-0000-4000-8000-000000000401',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        evidenceId: '00000000-0000-4000-8000-000000000801',
        sourceUtteranceIds: [],
        textForRetrieval: 'NRS 5점 통증 호소',
        timelineEventId: '00000000-0000-4000-8000-000000000901',
      }),
      expect.objectContaining({
        evidenceId: '00000000-0000-4000-8000-000000000501',
        sourceUtteranceIds: ['00000000-0000-4000-8000-000000000701'],
      }),
    ]);
  });
});
