import type { Clock } from '../../../common/time/clock';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { TimelineReader } from '../../timeline/application/ports/timeline-reader';
import { PatientNotFoundError } from '../domain/patient.errors';
import { PatientQueryService } from './patient-query.service';

const NOW = new Date('2026-08-19T00:00:00.000Z');
const CONTEXT: DemoSessionContext = {
  actorId: '11111111-1111-4111-8111-111111111111',
  datasetId: '22222222-2222-4222-8222-222222222222',
  wardId: '44444444-4444-4444-8444-444444444444',
};
const PATIENT_ID = '55555555-5555-4555-8555-555555555555';

describe('PatientQueryService', () => {
  it('담당 환자 목록을 현재 간호사 배정 scope로 조회한다', async () => {
    const prisma = createPrisma();
    prisma.patient.findMany.mockResolvedValue([
      patientRow({ displayName: '환자 A', roomLabel: '301호 1번 침상' }),
    ]);

    const patients = await createService(prisma).list(CONTEXT);

    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: assignedPatientWhere(),
        orderBy: [{ roomLabel: 'asc' }, { displayName: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(patients).toEqual([
      {
        patientId: PATIENT_ID,
        displayName: '환자 A',
        roomLabel: '301호 1번 침상',
        statusLabel: null,
        department: null,
        admittedAt: null,
        baselineSummary: null,
        createdAt: NOW,
      },
    ]);
  });

  it('환자 상세 조회 결과는 현재 DB에 없는 화면 보조 필드를 null로 둔다', async () => {
    const prisma = createPrisma();
    prisma.patient.findFirst.mockResolvedValue(patientRow({}));

    await expect(
      createService(prisma).get({ context: CONTEXT, patientId: PATIENT_ID }),
    ).resolves.toMatchObject({
      patientId: PATIENT_ID,
      statusLabel: null,
      department: null,
      admittedAt: null,
      baselineSummary: null,
    });
  });

  it('담당 scope에서 찾을 수 없는 환자는 PATIENT_NOT_FOUND로 거부한다', async () => {
    const prisma = createPrisma();
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      createService(prisma).get({ context: CONTEXT, patientId: PATIENT_ID }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });

  it('환자별 timeline 조회는 내부 TimelineReader에 기간 조건을 전달한다', async () => {
    const prisma = createPrisma();
    const timeline = createTimelineReader();
    const from = new Date('2026-08-19T00:00:00.000Z');
    const to = new Date('2026-08-19T23:59:59.000Z');

    await createService(prisma, timeline).readTimeline({
      context: CONTEXT,
      patientId: PATIENT_ID,
      from,
      to,
    });

    expect(timeline.read).toHaveBeenCalledWith({
      context: CONTEXT,
      patientId: PATIENT_ID,
      from,
      to,
    });
  });
});

function createService(
  prisma = createPrisma(),
  timeline = createTimelineReader(),
) {
  const clock = { now: jest.fn(() => NOW) } satisfies Pick<Clock, 'now'>;
  return new PatientQueryService(
    prisma as unknown as PrismaService,
    clock as Clock,
    timeline,
  );
}

function createPrisma() {
  return {
    patient: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function createTimelineReader(): jest.Mocked<TimelineReader> {
  return {
    read: jest.fn().mockResolvedValue([]),
    readMany: jest.fn().mockResolvedValue([]),
  };
}

function patientRow(input: { displayName?: string; roomLabel?: string }): {
  id: string;
  displayName: string;
  roomLabel: string;
  createdAt: Date;
} {
  return {
    id: PATIENT_ID,
    displayName: input.displayName ?? '환자 A',
    roomLabel: input.roomLabel ?? '301호',
    createdAt: NOW,
  };
}

function assignedPatientWhere() {
  return {
    datasetId: CONTEXT.datasetId,
    wardId: CONTEXT.wardId,
    patientAssignments: {
      some: {
        datasetId: CONTEXT.datasetId,
        wardId: CONTEXT.wardId,
        nurseId: CONTEXT.actorId,
        startsAt: { lte: NOW },
        OR: [{ endsAt: null }, { endsAt: { gte: NOW } }],
      },
    },
  };
}
