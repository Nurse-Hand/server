import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { PrismaTimelineReader } from './prisma-timeline.reader';

const CONTEXT: DemoSessionContext = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  wardId: '00000000-0000-4000-8000-000000000301',
};
const PATIENT_A = '00000000-0000-4000-8000-000000000401';
const PATIENT_B = '00000000-0000-4000-8000-000000000402';
const NOW = new Date('2026-08-18T02:00:00.000Z');

class FixedClock extends Clock {
  now(): Date {
    return new Date(NOW);
  }
}

type FakePrisma = {
  patient: { findMany: jest.Mock };
  timelineEvent: { findMany: jest.Mock };
};

describe('PrismaTimelineReader', () => {
  it('single read를 patientIds 한 건의 readMany로 위임한다', async () => {
    const reader = createReader(createPrisma());
    const readMany = jest.spyOn(reader, 'readMany').mockResolvedValue([]);

    await expect(
      reader.read({ context: CONTEXT, patientId: PATIENT_A }),
    ).resolves.toEqual([]);
    expect(readMany).toHaveBeenCalledTimes(1);
    expect(readMany).toHaveBeenCalledWith({
      context: CONTEXT,
      patientIds: [PATIENT_A],
    });
  });

  it('빈 patientIds는 DB query 없이 빈 결과를 반환한다', async () => {
    const prisma = createPrisma();
    const reader = createReader(prisma);

    await expect(
      reader.readMany({ context: CONTEXT, patientIds: [] }),
    ).resolves.toEqual([]);
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
    expect(prisma.timelineEvent.findMany).not.toHaveBeenCalled();
  });

  it('중복 ID를 제거하고 권한 1회와 event 1회로 안정 정렬 조회한다', async () => {
    const prisma = createPrisma();
    const expected = [
      {
        id: '10000000-0000-4000-8000-000000000902',
        patientId: PATIENT_B,
        occurredAt: NOW,
        type: 'TASK' as const,
        clinicalCategory: null,
        source: 'AI_AUDIO' as const,
        summary: 'Synthetic B',
        version: 1,
        sourceReference: 'synthetic:b',
      },
      {
        id: '10000000-0000-4000-8000-000000000901',
        patientId: PATIENT_A,
        occurredAt: NOW,
        type: 'OBSERVATION' as const,
        clinicalCategory: 'PAIN' as const,
        source: 'MANUAL' as const,
        summary: 'Synthetic A',
        version: 1,
        sourceReference: 'synthetic:a',
      },
    ];
    prisma.patient.findMany.mockResolvedValue([
      { id: PATIENT_A },
      { id: PATIENT_B },
    ]);
    prisma.timelineEvent.findMany.mockResolvedValue(expected);
    const reader = createReader(prisma);

    await expect(
      reader.readMany({
        context: CONTEXT,
        patientIds: [PATIENT_A, PATIENT_B, PATIENT_A],
      }),
    ).resolves.toEqual(expected);
    expect(prisma.patient.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [PATIENT_A, PATIENT_B] } }),
      }),
    );
    expect(prisma.timelineEvent.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.timelineEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: { in: [PATIENT_A, PATIENT_B] },
        }),
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: expect.objectContaining({ clinicalCategory: true }),
      }),
    );
    const patientAssignmentScope =
      prisma.patient.findMany.mock.calls[0][0].where.patientAssignments.some;
    const eventAssignmentScope =
      prisma.timelineEvent.findMany.mock.calls[0][0].where.patient
        .patientAssignments.some;
    expect(eventAssignmentScope).toEqual(patientAssignmentScope);
    expect(patientAssignmentScope).toMatchObject({
      datasetId: CONTEXT.datasetId,
      wardId: CONTEXT.wardId,
      nurseId: CONTEXT.actorId,
      startsAt: { lte: NOW },
      OR: [{ endsAt: null }, { endsAt: { gte: NOW } }],
    });
  });

  it('요청 환자 중 하나라도 활성 배정 범위 밖이면 부분 반환하지 않는다', async () => {
    const prisma = createPrisma();
    prisma.patient.findMany.mockResolvedValue([{ id: PATIENT_A }]);
    const reader = createReader(prisma);

    await expect(
      reader.readMany({
        context: CONTEXT,
        patientIds: [PATIENT_A, PATIENT_B],
      }),
    ).rejects.toMatchObject({ code: 'PATIENT_NOT_FOUND' });
    expect(prisma.timelineEvent.findMany).not.toHaveBeenCalled();
  });
});

function createPrisma(): FakePrisma {
  return {
    patient: { findMany: jest.fn() },
    timelineEvent: { findMany: jest.fn() },
  };
}

function createReader(prisma: FakePrisma): PrismaTimelineReader {
  return new PrismaTimelineReader(
    prisma as unknown as PrismaService,
    new FixedClock(),
  );
}
