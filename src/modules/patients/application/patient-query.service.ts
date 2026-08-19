import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  TIMELINE_READER,
  type TimelineReader,
} from '../../timeline/application/ports/timeline-reader';
import { PatientNotFoundError } from '../domain/patient.errors';
import type {
  PatientReadModel,
  PatientTimelineReadModel,
} from './patient.models';

@Injectable()
export class PatientQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(TIMELINE_READER) private readonly timelineReader: TimelineReader,
  ) {}

  async list(
    context: DemoSessionContext,
  ): Promise<readonly PatientReadModel[]> {
    const now = this.clock.now();
    const patients = await this.prisma.patient.findMany({
      where: this.assignedPatientWhere(context, now),
      orderBy: [{ roomLabel: 'asc' }, { displayName: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        displayName: true,
        roomLabel: true,
        createdAt: true,
      },
    });

    return patients.map(mapPatient);
  }

  async get(input: {
    context: DemoSessionContext;
    patientId: string;
  }): Promise<PatientReadModel> {
    const now = this.clock.now();
    const patient = await this.prisma.patient.findFirst({
      where: {
        ...this.assignedPatientWhere(input.context, now),
        id: input.patientId,
      },
      select: {
        id: true,
        displayName: true,
        roomLabel: true,
        createdAt: true,
      },
    });

    if (!patient) {
      throw new PatientNotFoundError();
    }

    return mapPatient(patient);
  }

  async readTimeline(input: {
    context: DemoSessionContext;
    patientId: string;
    from?: Date;
    to?: Date;
  }): Promise<readonly PatientTimelineReadModel[]> {
    return this.timelineReader.read({
      context: input.context,
      patientId: input.patientId,
      ...(input.from === undefined ? {} : { from: input.from }),
      ...(input.to === undefined ? {} : { to: input.to }),
    });
  }

  private assignedPatientWhere(context: DemoSessionContext, now: Date) {
    return {
      datasetId: context.datasetId,
      wardId: context.wardId,
      patientAssignments: {
        some: {
          datasetId: context.datasetId,
          wardId: context.wardId,
          nurseId: context.actorId,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
      },
    };
  }
}

function mapPatient(patient: {
  id: string;
  displayName: string;
  roomLabel: string;
  createdAt: Date;
}): PatientReadModel {
  return {
    patientId: patient.id,
    displayName: patient.displayName,
    roomLabel: patient.roomLabel,
    statusLabel: null,
    department: null,
    admittedAt: null,
    baselineSummary: null,
    createdAt: patient.createdAt,
  };
}
