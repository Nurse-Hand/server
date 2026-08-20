import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  PatientCommandInvalidError,
  PatientCurrentShiftNotFoundError,
  PatientNotFoundError,
} from '../domain/patient.errors';
import type { PatientReadModel } from './patient.models';

export type CreatePatientInput = {
  displayName: string;
  roomLabel: string;
  patientCode?: string | null;
  statusLabel?: string | null;
  department?: string | null;
  admittedAt?: string | null;
  baselineSummary?: string | null;
};

export type UpdatePatientInput = Partial<CreatePatientInput>;

export type DischargePatientInput = {
  dischargedAt?: string;
};

type PatientRow = {
  id: string;
  displayName: string;
  roomLabel: string;
  patientCode: string | null;
  statusLabel: string | null;
  department: string | null;
  admittedAt: Date | null;
  baselineSummary: string | null;
  createdAt: Date;
};

const patientSelect = {
  id: true,
  displayName: true,
  roomLabel: true,
  patientCode: true,
  statusLabel: true,
  department: true,
  admittedAt: true,
  baselineSummary: true,
  createdAt: true,
} satisfies Prisma.PatientSelect;

@Injectable()
export class PatientCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async create(
    context: DemoSessionContext,
    input: CreatePatientInput,
  ): Promise<PatientReadModel> {
    const now = this.clock.now();

    return this.prisma.$transaction(async (transaction) => {
      const shift = await transaction.nurseShift.findFirst({
        where: {
          datasetId: context.datasetId,
          nurseId: context.actorId,
          wardId: context.wardId,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
        select: { id: true, endsAt: true },
      });

      if (!shift) {
        throw new PatientCurrentShiftNotFoundError();
      }

      const patient = await transaction.patient.create({
        data: {
          datasetId: context.datasetId,
          logicalKey: `patient:${randomUUID()}`,
          wardId: context.wardId,
          displayName: input.displayName,
          roomLabel: input.roomLabel,
          patientCode: normalizeNullable(input.patientCode),
          statusLabel: normalizeNullable(input.statusLabel),
          department: normalizeNullable(input.department),
          admittedAt: parseOptionalDate(input.admittedAt),
          baselineSummary: normalizeNullable(input.baselineSummary),
        },
        select: patientSelect,
      });

      await transaction.patientAssignment.create({
        data: {
          datasetId: context.datasetId,
          logicalKey: `assignment:${randomUUID()}`,
          patientId: patient.id,
          nurseId: context.actorId,
          wardId: context.wardId,
          nurseShiftId: shift.id,
          startsAt: now,
          endsAt: shift.endsAt,
        },
      });

      return mapPatient(patient);
    });
  }

  async update(
    context: DemoSessionContext,
    patientId: string,
    input: UpdatePatientInput,
  ): Promise<PatientReadModel> {
    const data = buildPatientUpdateData(input);
    if (Object.keys(data).length === 0) {
      throw new PatientCommandInvalidError(
        '수정할 환자 기본정보를 하나 이상 입력해야 합니다.',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      await assertActivePatient(
        transaction,
        context,
        patientId,
        this.clock.now(),
      );

      const patient = await transaction.patient.update({
        where: {
          patient_dataset_id: { datasetId: context.datasetId, id: patientId },
        },
        data,
        select: patientSelect,
      });

      return mapPatient(patient);
    });
  }

  async discharge(
    context: DemoSessionContext,
    patientId: string,
    input: DischargePatientInput,
  ): Promise<PatientReadModel> {
    const dischargedAt =
      input.dischargedAt === undefined
        ? this.clock.now()
        : new Date(input.dischargedAt);

    return this.prisma.$transaction(async (transaction) => {
      const patient = await assertActivePatient(
        transaction,
        context,
        patientId,
        dischargedAt,
      );

      await transaction.patientAssignment.updateMany({
        where: {
          datasetId: context.datasetId,
          patientId,
          nurseId: context.actorId,
          wardId: context.wardId,
          startsAt: { lte: dischargedAt },
          OR: [{ endsAt: null }, { endsAt: { gt: dischargedAt } }],
        },
        data: { endsAt: dischargedAt },
      });

      return mapPatient(patient);
    });
  }
}

async function assertActivePatient(
  transaction: Pick<Prisma.TransactionClient, 'patient'>,
  context: DemoSessionContext,
  patientId: string,
  at: Date,
): Promise<PatientRow> {
  const patient = await transaction.patient.findFirst({
    where: {
      id: patientId,
      datasetId: context.datasetId,
      wardId: context.wardId,
      patientAssignments: {
        some: {
          datasetId: context.datasetId,
          wardId: context.wardId,
          nurseId: context.actorId,
          startsAt: { lte: at },
          OR: [{ endsAt: null }, { endsAt: { gte: at } }],
        },
      },
    },
    select: patientSelect,
  });

  if (!patient) {
    throw new PatientNotFoundError();
  }

  return patient;
}

function buildPatientUpdateData(
  input: UpdatePatientInput,
): Prisma.PatientUpdateInput {
  const data: Prisma.PatientUpdateInput = {};

  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.roomLabel !== undefined) data.roomLabel = input.roomLabel;
  if (input.patientCode !== undefined) {
    data.patientCode = normalizeNullable(input.patientCode);
  }
  if (input.statusLabel !== undefined) {
    data.statusLabel = normalizeNullable(input.statusLabel);
  }
  if (input.department !== undefined) {
    data.department = normalizeNullable(input.department);
  }
  if (input.admittedAt !== undefined) {
    data.admittedAt = parseOptionalDate(input.admittedAt);
  }
  if (input.baselineSummary !== undefined) {
    data.baselineSummary = normalizeNullable(input.baselineSummary);
  }

  return data;
}

function normalizeNullable(value: string | null | undefined): string | null {
  return value === undefined ? null : value;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  return new Date(value);
}

function mapPatient(patient: PatientRow): PatientReadModel {
  return {
    patientId: patient.id,
    displayName: patient.displayName,
    roomLabel: patient.roomLabel,
    patientCode: patient.patientCode,
    statusLabel: patient.statusLabel,
    department: patient.department,
    admittedAt: patient.admittedAt,
    baselineSummary: patient.baselineSummary,
    createdAt: patient.createdAt,
  };
}
