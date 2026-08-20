import type { Clock } from '../../../common/time/clock';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  PatientCommandInvalidError,
  PatientCurrentShiftNotFoundError,
  PatientNotFoundError,
} from '../domain/patient.errors';
import { PatientCommandService } from './patient-command.service';

const NOW = new Date('2026-08-20T01:00:00.000Z');
const CONTEXT: DemoSessionContext = {
  actorId: '11111111-1111-4111-8111-111111111111',
  datasetId: '22222222-2222-4222-8222-222222222222',
  wardId: '44444444-4444-4444-8444-444444444444',
};
const PATIENT_ID = '55555555-5555-4555-8555-555555555555';
const SHIFT_ID = '66666666-6666-4666-8666-666666666666';
const SHIFT_ENDS_AT = new Date('2026-08-20T08:00:00.000Z');

describe('PatientCommandService', () => {
  it('환자 추가 시 현재 간호사 shift에 active assignment를 만든다', async () => {
    const prisma = createPrisma();
    const transaction = createTransaction();
    prisma.$transaction.mockImplementation((handler) => handler(transaction));
    transaction.nurseShift.findFirst.mockResolvedValue({
      id: SHIFT_ID,
      endsAt: SHIFT_ENDS_AT,
    });
    transaction.patient.create.mockResolvedValue(patientRow({}));
    transaction.patientAssignment.create.mockResolvedValue({});

    const patient = await createService(prisma).create(CONTEXT, {
      displayName: '환자 C',
      roomLabel: '212호 1번 침상',
      patientCode: 'P-212-01',
      admittedAt: '2026-08-20T09:00:00+09:00',
    });

    expect(transaction.nurseShift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          datasetId: CONTEXT.datasetId,
          nurseId: CONTEXT.actorId,
          wardId: CONTEXT.wardId,
          startsAt: { lte: NOW },
          endsAt: { gt: NOW },
        },
      }),
    );
    expect(transaction.patient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          datasetId: CONTEXT.datasetId,
          wardId: CONTEXT.wardId,
          displayName: '환자 C',
          roomLabel: '212호 1번 침상',
          patientCode: 'P-212-01',
          admittedAt: new Date('2026-08-20T00:00:00.000Z'),
        }),
      }),
    );
    expect(transaction.patientAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        datasetId: CONTEXT.datasetId,
        patientId: PATIENT_ID,
        nurseId: CONTEXT.actorId,
        wardId: CONTEXT.wardId,
        nurseShiftId: SHIFT_ID,
        startsAt: NOW,
        endsAt: SHIFT_ENDS_AT,
      }),
    });
    expect(patient.patientId).toBe(PATIENT_ID);
  });

  it('현재 근무 shift가 없으면 환자 추가를 거부한다', async () => {
    const prisma = createPrisma();
    const transaction = createTransaction();
    prisma.$transaction.mockImplementation((handler) => handler(transaction));
    transaction.nurseShift.findFirst.mockResolvedValue(null);

    await expect(
      createService(prisma).create(CONTEXT, {
        displayName: '환자 C',
        roomLabel: '212호 1번 침상',
      }),
    ).rejects.toBeInstanceOf(PatientCurrentShiftNotFoundError);
    expect(transaction.patient.create).not.toHaveBeenCalled();
  });

  it('환자 수정은 active assignment scope를 확인한 뒤 기본정보만 갱신한다', async () => {
    const prisma = createPrisma();
    const transaction = createTransaction();
    prisma.$transaction.mockImplementation((handler) => handler(transaction));
    transaction.patient.findFirst.mockResolvedValue(patientRow({}));
    transaction.patient.update.mockResolvedValue(
      patientRow({ statusLabel: '관찰' }),
    );

    const patient = await createService(prisma).update(CONTEXT, PATIENT_ID, {
      statusLabel: '관찰',
      baselineSummary: null,
    });

    expect(transaction.patient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: PATIENT_ID,
          datasetId: CONTEXT.datasetId,
          wardId: CONTEXT.wardId,
        }),
      }),
    );
    expect(transaction.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patient_dataset_id: {
            datasetId: CONTEXT.datasetId,
            id: PATIENT_ID,
          },
        },
        data: { statusLabel: '관찰', baselineSummary: null },
      }),
    );
    expect(patient.statusLabel).toBe('관찰');
  });

  it('수정 필드가 없으면 환자 수정을 거부한다', async () => {
    await expect(
      createService().update(CONTEXT, PATIENT_ID, {}),
    ).rejects.toBeInstanceOf(PatientCommandInvalidError);
  });

  it('퇴원 처리는 active assignment의 종료 시각을 갱신한다', async () => {
    const prisma = createPrisma();
    const transaction = createTransaction();
    const dischargedAt = new Date('2026-08-20T09:00:00.000Z');
    prisma.$transaction.mockImplementation((handler) => handler(transaction));
    transaction.patient.findFirst.mockResolvedValue(patientRow({}));
    transaction.patientAssignment.updateMany.mockResolvedValue({ count: 1 });

    const patient = await createService(prisma).discharge(CONTEXT, PATIENT_ID, {
      dischargedAt: '2026-08-20T18:00:00+09:00',
    });

    expect(transaction.patientAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        datasetId: CONTEXT.datasetId,
        patientId: PATIENT_ID,
        nurseId: CONTEXT.actorId,
        wardId: CONTEXT.wardId,
        startsAt: { lte: dischargedAt },
        OR: [{ endsAt: null }, { endsAt: { gt: dischargedAt } }],
      },
      data: { endsAt: dischargedAt },
    });
    expect(patient.patientId).toBe(PATIENT_ID);
  });

  it('active assignment가 없으면 퇴원 처리를 거부한다', async () => {
    const prisma = createPrisma();
    const transaction = createTransaction();
    prisma.$transaction.mockImplementation((handler) => handler(transaction));
    transaction.patient.findFirst.mockResolvedValue(null);

    await expect(
      createService(prisma).discharge(CONTEXT, PATIENT_ID, {}),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });
});

function createService(prisma = createPrisma()) {
  const clock = { now: jest.fn(() => NOW) } satisfies Pick<Clock, 'now'>;
  return new PatientCommandService(
    prisma as unknown as PrismaService,
    clock as Clock,
  );
}

function createPrisma() {
  return {
    $transaction: jest.fn((handler) => handler(createTransaction())),
  };
}

function createTransaction() {
  return {
    nurseShift: {
      findFirst: jest.fn(),
    },
    patient: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    patientAssignment: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

function patientRow(input: {
  displayName?: string;
  roomLabel?: string;
  statusLabel?: string | null;
}) {
  return {
    id: PATIENT_ID,
    displayName: input.displayName ?? '환자 C',
    roomLabel: input.roomLabel ?? '212호 1번 침상',
    patientCode: 'P-212-01',
    statusLabel: input.statusLabel ?? '주의',
    department: '소화기내과',
    admittedAt: new Date('2026-08-20T00:00:00.000Z'),
    baselineSummary: 'CT 결과 대기 중',
    createdAt: NOW,
  };
}
