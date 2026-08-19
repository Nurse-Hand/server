import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { TaskExtractionEvidencePort } from '../application/ports/task-extraction-evidence.port';
import { formatTaskWorkDate } from '../domain/task-work-date';
import { DeterministicTaskExtractionEvidenceAdapter } from './deterministic-task-extraction-evidence.adapter';

const CONTEXT: DemoSessionContext = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};

describe('DeterministicTaskExtractionEvidenceAdapter', () => {
  const findSegments = jest.fn();
  const port: TaskExtractionEvidencePort =
    new DeterministicTaskExtractionEvidenceAdapter({
      roundingPatientSegment: { findMany: findSegments },
    } as unknown as PrismaService);

  beforeEach(() => {
    findSegments.mockReset().mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000501',
        patientId: '00000000-0000-4000-8000-000000000701',
        sequence: 1,
        startedAt: new Date('2026-08-18T15:00:00.000Z'),
        endedAt: new Date('2026-08-18T15:30:00.000Z'),
        note: 'Synthetic rounding evidence 1',
      },
      {
        id: '00000000-0000-4000-8000-000000000502',
        patientId: '00000000-0000-4000-8000-000000000702',
        sequence: 2,
        startedAt: new Date('2026-08-18T15:30:00.000Z'),
        endedAt: new Date('2026-08-18T16:00:00.000Z'),
        note: 'Synthetic rounding evidence 2',
      },
    ]);
  });

  it('중복 record ID를 첫 등장 순서로 제거하고 고정된 synthetic snapshot을 만든다', async () => {
    const result = await port.read({
      context: CONTEXT,
      roundingSessionId: '00000000-0000-4000-8000-000000000401',
      recordIds: [
        '00000000-0000-4000-8000-000000000501',
        '00000000-0000-4000-8000-000000000502',
        '00000000-0000-4000-8000-000000000501',
      ],
    });

    expect(result.roundingSessionId).toBe(
      '00000000-0000-4000-8000-000000000401',
    );
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
        recordId: '00000000-0000-4000-8000-000000000501',
        sourceType: 'ROUNDING_SEGMENT',
        sourceId: '00000000-0000-4000-8000-000000000501',
        patientId: '00000000-0000-4000-8000-000000000701',
        workDate: '2026-08-19',
        summary: 'Synthetic rounding evidence 1',
      },
      {
        recordId: '00000000-0000-4000-8000-000000000502',
        sourceType: 'ROUNDING_SEGMENT',
        sourceId: '00000000-0000-4000-8000-000000000502',
        patientId: '00000000-0000-4000-8000-000000000702',
        workDate: '2026-08-19',
        summary: 'Synthetic rounding evidence 2',
      },
    ]);
  });

  it('같은 Clock과 입력에는 동일한 snapshot을 반환한다', async () => {
    const input = {
      context: CONTEXT,
      roundingSessionId: '00000000-0000-4000-8000-000000000401',
      recordIds: ['00000000-0000-4000-8000-000000000501'],
    };

    await expect(port.read(input)).resolves.toEqual(await port.read(input));
  });

  it('빈 record 목록은 부분 synthetic evidence를 만들지 않고 빈 결과를 반환한다', async () => {
    await expect(
      port.read({
        context: CONTEXT,
        roundingSessionId: '00000000-0000-4000-8000-000000000401',
        recordIds: [],
      }),
    ).resolves.toEqual({
      roundingSessionId: '00000000-0000-4000-8000-000000000401',
      evidence: [],
    });
    expect(findSegments).not.toHaveBeenCalled();
  });
});
