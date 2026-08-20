import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  ReadTimelineInput,
  ReadTimelinesInput,
  TimelineEventReadModel,
  TimelineReader,
} from '../application/ports/timeline-reader';
import {
  PatientTimelineNotFoundError,
  TimelinePeriodInvalidError,
} from '../domain/timeline.errors';

@Injectable()
export class PrismaTimelineReader implements TimelineReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async read(
    input: ReadTimelineInput,
  ): Promise<readonly TimelineEventReadModel[]> {
    return this.readMany({
      context: input.context,
      patientIds: [input.patientId],
      ...(input.from === undefined ? {} : { from: input.from }),
      ...(input.to === undefined ? {} : { to: input.to }),
    });
  }

  async readMany(
    input: ReadTimelinesInput,
  ): Promise<readonly TimelineEventReadModel[]> {
    if (input.from && input.to && input.from.getTime() > input.to.getTime()) {
      throw new TimelinePeriodInvalidError();
    }

    const patientIds = [...new Set(input.patientIds)];

    if (patientIds.length === 0) {
      return [];
    }

    const now = this.clock.now();
    const scope = {
      datasetId: input.context.datasetId,
      wardId: input.context.wardId,
      nurseId: input.context.actorId,
    };
    const patients = await this.prisma.patient.findMany({
      where: {
        id: { in: patientIds },
        datasetId: scope.datasetId,
        wardId: scope.wardId,
        patientAssignments: {
          some: {
            datasetId: scope.datasetId,
            wardId: scope.wardId,
            nurseId: scope.nurseId,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gte: now } }],
          },
        },
      },
      select: { id: true },
    });

    if (patients.length !== patientIds.length) {
      throw new PatientTimelineNotFoundError();
    }

    return this.prisma.timelineEvent.findMany({
      where: {
        datasetId: scope.datasetId,
        wardId: scope.wardId,
        patientId: { in: patientIds },
        patient: {
          patientAssignments: {
            some: {
              datasetId: scope.datasetId,
              wardId: scope.wardId,
              nurseId: scope.nurseId,
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gte: now } }],
            },
          },
        },
        occurredAt: {
          ...(input.from === undefined ? {} : { gte: input.from }),
          ...(input.to === undefined ? {} : { lte: input.to }),
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        patientId: true,
        occurredAt: true,
        type: true,
        source: true,
        summary: true,
        important: true,
        confirmationStatus: true,
        version: true,
        sourceReference: true,
        updatedAt: true,
        updatedByActorId: true,
      },
    });
  }
}
