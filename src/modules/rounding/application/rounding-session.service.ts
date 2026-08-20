import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  RoundingSessionCompletedAtInvalidError,
  RoundingPatientNotFoundError,
  RoundingSegmentPeriodInvalidError,
  RoundingSessionAlreadyCompletedError,
  RoundingSessionNotFoundError,
} from '../domain/rounding.errors';
import type {
  AddRoundingPatientSegmentInput,
  CompleteRoundingSessionInput,
  ReadRoundingSessionInput,
  RoundingPatientSegmentReadModel,
  RoundingSessionReadModel,
  StartRoundingSessionInput,
} from './rounding-session.types';

type RoundingSessionRow = {
  id: string;
  status: 'RECORDING' | 'COMPLETED';
  actorId: string;
  wardId: string;
  startedAt: Date;
  completedAt: Date | null;
  note: string | null;
  version: number;
  segments: {
    id: string;
    patientId: string;
    sequence: number;
    startedAt: Date;
    endedAt: Date;
    note: string | null;
  }[];
};

@Injectable()
export class RoundingSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async start(
    input: StartRoundingSessionInput,
  ): Promise<RoundingSessionReadModel> {
    const now = this.clock.now();
    const session = await this.prisma.roundingSession.create({
      data: {
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        startedAt: input.startedAt ?? now,
        note: input.note,
      },
      select: roundingSessionSelect,
    });

    return mapSession(session);
  }

  async addPatientSegment(
    input: AddRoundingPatientSegmentInput,
  ): Promise<RoundingSessionReadModel> {
    if (input.startedAt.getTime() >= input.endedAt.getTime()) {
      throw new RoundingSegmentPeriodInvalidError();
    }

    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.roundingSession.findFirst({
        where: {
          id: input.sessionId,
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
        },
        select: { id: true, status: true, startedAt: true },
      });

      if (!session) {
        throw new RoundingSessionNotFoundError();
      }

      if (session.status === 'COMPLETED') {
        throw new RoundingSessionAlreadyCompletedError();
      }

      const patient = await transaction.patient.findFirst({
        where: {
          id: input.patientId,
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          patientAssignments: {
            some: {
              datasetId: input.context.datasetId,
              wardId: input.context.wardId,
              nurseId: input.context.actorId,
              startsAt: { lte: input.startedAt },
              OR: [{ endsAt: null }, { endsAt: { gte: input.endedAt } }],
            },
          },
        },
        select: { id: true },
      });

      if (!patient) {
        throw new RoundingPatientNotFoundError();
      }

      const aggregate = await transaction.roundingPatientSegment.aggregate({
        where: {
          datasetId: input.context.datasetId,
          roundingSessionId: input.sessionId,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      await transaction.roundingPatientSegment.create({
        data: {
          datasetId: input.context.datasetId,
          roundingSessionId: input.sessionId,
          patientId: input.patientId,
          wardId: input.context.wardId,
          sequence: nextSequence,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          note: input.note,
        },
      });

      const updated = await transaction.roundingSession.findFirst({
        where: {
          id: input.sessionId,
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
        },
        select: roundingSessionSelect,
      });

      if (!updated) {
        throw new RoundingSessionNotFoundError();
      }

      return mapSession(updated);
    });
  }

  async complete(
    input: CompleteRoundingSessionInput,
  ): Promise<RoundingSessionReadModel> {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.roundingSession.findFirst({
        where: {
          id: input.sessionId,
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
        },
        select: { id: true, status: true, startedAt: true },
      });

      if (!session) {
        throw new RoundingSessionNotFoundError();
      }

      if (session.status === 'COMPLETED') {
        throw new RoundingSessionAlreadyCompletedError();
      }

      const completedAt = input.completedAt ?? this.clock.now();

      if (completedAt.getTime() < session.startedAt.getTime()) {
        throw new RoundingSessionCompletedAtInvalidError();
      }

      const completed = await transaction.roundingSession.update({
        where: {
          rounding_session_dataset_id: {
            datasetId: input.context.datasetId,
            id: input.sessionId,
          },
        },
        data: {
          status: 'COMPLETED',
          completedAt,
          version: { increment: 1 },
        },
        select: roundingSessionSelect,
      });

      return mapSession(completed);
    });
  }

  async read(
    input: ReadRoundingSessionInput,
  ): Promise<RoundingSessionReadModel> {
    const session = await this.prisma.roundingSession.findFirst({
      where: {
        id: input.sessionId,
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
      },
      select: roundingSessionSelect,
    });

    if (!session) {
      throw new RoundingSessionNotFoundError();
    }

    return mapSession(session);
  }
}

const roundingSessionSelect = {
  id: true,
  status: true,
  actorId: true,
  wardId: true,
  startedAt: true,
  completedAt: true,
  note: true,
  version: true,
  segments: {
    orderBy: [{ sequence: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      patientId: true,
      sequence: true,
      startedAt: true,
      endedAt: true,
      note: true,
    },
  },
};

function mapSession(row: RoundingSessionRow): RoundingSessionReadModel {
  return {
    id: row.id,
    status: row.status,
    actorId: row.actorId,
    wardId: row.wardId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    note: row.note,
    version: row.version,
    segments: row.segments.map(mapSegment),
  };
}

function mapSegment(
  row: RoundingSessionRow['segments'][number],
): RoundingPatientSegmentReadModel {
  return {
    id: row.id,
    patientId: row.patientId,
    sequence: row.sequence,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    note: row.note,
  };
}
