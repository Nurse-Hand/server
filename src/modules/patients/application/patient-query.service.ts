import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  TIMELINE_READER,
  type TimelineReader,
} from '../../timeline/application/ports/timeline-reader';
import {
  PatientNotFoundError,
  PatientTimelineQueryInvalidError,
} from '../domain/patient.errors';
import type {
  PatientReadModel,
  PatientTimelineReadResult,
  PatientTimelineReadModel,
} from './patient.models';

const SEOUL_OFFSET = '+09:00';
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
        patientCode: true,
        statusLabel: true,
        department: true,
        admittedAt: true,
        baselineSummary: true,
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
        patientCode: true,
        statusLabel: true,
        department: true,
        admittedAt: true,
        baselineSummary: true,
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
    workDate?: string;
    from?: Date;
    to?: Date;
  }): Promise<PatientTimelineReadResult> {
    const patient = await this.get({
      context: input.context,
      patientId: input.patientId,
    });
    const range = input.workDate
      ? seoulDateRangeInclusive(input.workDate)
      : null;
    const items = await this.timelineReader.read({
      context: input.context,
      patientId: input.patientId,
      ...(range
        ? { from: range.from, to: range.to }
        : {
            ...(input.from === undefined ? {} : { from: input.from }),
            ...(input.to === undefined ? {} : { to: input.to }),
          }),
    });

    return {
      patient,
      workDate: input.workDate ?? null,
      daySummary: summarizeTimeline(items),
      items,
    };
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
  patientCode: string | null;
  statusLabel: string | null;
  department: string | null;
  admittedAt: Date | null;
  baselineSummary: string | null;
  createdAt: Date;
}): PatientReadModel {
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

function seoulDateRangeInclusive(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00.000${SEOUL_OFFSET}`);

  if (
    !ISO_DATE_PATTERN.test(date) ||
    Number.isNaN(from.getTime()) ||
    toSeoulDate(from) !== date
  ) {
    throw new PatientTimelineQueryInvalidError(
      'workDate는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.',
    );
  }

  return {
    from,
    to: new Date(from.getTime() + DAY_IN_MILLISECONDS - 1),
  };
}

function toSeoulDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function summarizeTimeline(
  items: readonly PatientTimelineReadModel[],
): string | null {
  if (items.length === 0) return null;

  const ordered = [...items].sort(
    (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
  );
  const important = ordered.filter((item) => item.important);
  const sources = important.length > 0 ? important : ordered.slice(0, 2);

  return sources.map((item) => item.summary).join(' / ');
}
