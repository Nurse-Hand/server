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
        patientCode: 'P-301-01',
        statusLabel: '주의',
        department: '정형외과',
        admittedAt: new Date('2026-07-30T00:00:00.000Z'),
        baselineSummary: '우측 대퇴골 골절 수술 후 통증 조절 및 보행 재활 중',
        createdAt: NOW,
      },
    ]);
  });

  it('환자 상세 조회 결과는 와이어프레임 기본정보 필드를 포함한다', async () => {
    const prisma = createPrisma();
    prisma.patient.findFirst.mockResolvedValue(patientRow({}));

    await expect(
      createService(prisma).get({ context: CONTEXT, patientId: PATIENT_ID }),
    ).resolves.toMatchObject({
      patientId: PATIENT_ID,
      patientCode: 'P-301-01',
      statusLabel: '주의',
      department: '정형외과',
      admittedAt: new Date('2026-07-30T00:00:00.000Z'),
      baselineSummary: '우측 대퇴골 골절 수술 후 통증 조절 및 보행 재활 중',
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
    prisma.patient.findFirst.mockResolvedValue(patientRow({}));
    const timeline = createTimelineReader();
    const from = new Date('2026-08-19T00:00:00.000Z');
    const to = new Date('2026-08-19T23:59:59.000Z');

    const result = await createService(prisma, timeline).readTimeline({
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
    expect(result.patient.patientId).toBe(PATIENT_ID);
    expect(result.workDate).toBeNull();
    expect(result.daySummary).toBeNull();
  });

  it('workDate가 있으면 Asia/Seoul 하루 범위로 timeline을 조회한다', async () => {
    const prisma = createPrisma();
    prisma.patient.findFirst.mockResolvedValue(patientRow({}));
    const timeline = createTimelineReader();
    timeline.read.mockResolvedValue([
      {
        id: '66666666-6666-4666-8666-666666666666',
        patientId: PATIENT_ID,
        occurredAt: new Date('2026-08-20T00:30:00.000Z'),
        type: 'OBSERVATION',
        source: 'AI_AUDIO',
        summary: '야간 기침 증상이 잦아짐',
        important: true,
        confirmationStatus: 'CONFIRMED',
        version: 1,
        sourceReference: 'timeline:event:night-cough',
        updatedAt: new Date('2026-08-20T00:30:00.000Z'),
        updatedByActorId: null,
      },
    ]);

    const result = await createService(prisma, timeline).readTimeline({
      context: CONTEXT,
      patientId: PATIENT_ID,
      workDate: '2026-08-20',
    });

    expect(timeline.read).toHaveBeenCalledWith({
      context: CONTEXT,
      patientId: PATIENT_ID,
      from: new Date('2026-08-19T15:00:00.000Z'),
      to: new Date('2026-08-20T14:59:59.999Z'),
    });
    expect(result).toMatchObject({
      workDate: '2026-08-20',
      daySummary: '야간 기침 증상이 잦아짐',
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
  patientCode: string;
  statusLabel: string;
  department: string;
  admittedAt: Date;
  baselineSummary: string;
  createdAt: Date;
} {
  return {
    id: PATIENT_ID,
    displayName: input.displayName ?? '환자 A',
    roomLabel: input.roomLabel ?? '301호',
    patientCode: 'P-301-01',
    statusLabel: '주의',
    department: '정형외과',
    admittedAt: new Date('2026-07-30T00:00:00.000Z'),
    baselineSummary: '우측 대퇴골 골절 수술 후 통증 조절 및 보행 재활 중',
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
