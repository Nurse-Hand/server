import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { formatTaskWorkDate } from '../domain/task-work-date';
import { PrismaTaskExtractionEvidenceAdapter } from './prisma-task-extraction-evidence.adapter';

const CONTEXT: DemoSessionContext = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};

const ROUNDING_SESSION_ID = '00000000-0000-4000-8000-000000000401';
const ROUNDING_RECORD_ID = '00000000-0000-4000-8000-000000000501';
const QUICK_NOTE_ID = '00000000-0000-4000-8000-000000000601';

describe('PrismaTaskExtractionEvidenceAdapter', () => {
  it('라운딩 record와 빠른기록 ID를 업무 추출 근거로 읽는다', async () => {
    const prisma = {
      timelineEvent: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      roundingRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: ROUNDING_RECORD_ID,
            patientId: '00000000-0000-4000-8000-000000000701',
            workDate: new Date('2026-08-20T00:00:00.000Z'),
            note: '산소포화도 재측정 필요',
            sequence: 1,
            startedAt: new Date('2026-08-20T01:00:00.000Z'),
          },
        ]),
      },
      quickNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: QUICK_NOTE_ID,
            patientId: '00000000-0000-4000-8000-000000000702',
            occurredAt: new Date('2026-08-20T02:00:00.000Z'),
            text: 'NRS 5점 통증 호소',
            structuredFacts: { summary: '통증 재평가 필요' },
          },
        ]),
      },
    };
    const adapter = new PrismaTaskExtractionEvidenceAdapter(prisma as never);

    const result = await adapter.read({
      context: CONTEXT,
      roundingSessionId: ROUNDING_SESSION_ID,
      recordIds: [ROUNDING_RECORD_ID, QUICK_NOTE_ID],
    });

    expect(result.roundingSessionId).toBe(ROUNDING_SESSION_ID);
    expect(
      result.evidence.map((evidence) => ({
        recordId: evidence.recordId,
        sourceType: evidence.sourceType,
        sourceId: evidence.sourceId,
        patientId: evidence.patientId,
        workDate: formatTaskWorkDate(evidence.workDate),
        summary: evidence.summary,
      })),
    ).toEqual([
      {
        recordId: ROUNDING_RECORD_ID,
        sourceType: 'TIMELINE_EVENT',
        sourceId: ROUNDING_RECORD_ID,
        patientId: '00000000-0000-4000-8000-000000000701',
        workDate: '2026-08-20',
        summary: '산소포화도 재측정 필요',
      },
      {
        recordId: QUICK_NOTE_ID,
        sourceType: 'TIMELINE_EVENT',
        sourceId: QUICK_NOTE_ID,
        patientId: '00000000-0000-4000-8000-000000000702',
        workDate: '2026-08-20',
        summary: 'NRS 5점 통증 호소',
      },
    ]);
  });
});
