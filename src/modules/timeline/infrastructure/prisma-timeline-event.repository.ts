import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { VersionConflictError } from '../../../common/errors/version-conflict.error';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  TimelineEventRepository,
  UpdateTimelineEventCommand,
} from '../application/ports/timeline-event.repository';
import type {
  TimelineEventDetail,
  TimelineEventHistoryItem,
} from '../application/timeline-event.models';
import { TimelineEventNotFoundError } from '../domain/timeline.errors';

const TIMELINE_EVENT_SELECT = {
  id: true,
  patientId: true,
  occurredAt: true,
  type: true,
  source: true,
  sourceReference: true,
  summary: true,
  important: true,
  confirmationStatus: true,
  version: true,
  updatedAt: true,
  updatedByActorId: true,
} satisfies Prisma.TimelineEventSelect;

type TimelineEventRow = Prisma.TimelineEventGetPayload<{
  select: typeof TIMELINE_EVENT_SELECT;
}>;

type DatabaseClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class PrismaTimelineEventRepository implements TimelineEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async update(
    command: UpdateTimelineEventCommand,
  ): Promise<TimelineEventDetail> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await this.findAccessibleEvent(
        transaction,
        command.context,
        command.eventId,
        command.now,
      );

      if (current.version !== command.expectedVersion) {
        throw new VersionConflictError(
          command.expectedVersion,
          current.version,
        );
      }

      const nextSummary = command.summary ?? current.summary;
      const nextImportant = command.important ?? current.important;
      const nextConfirmationStatus =
        command.confirmationStatus ?? current.confirmationStatus;

      const changed =
        nextSummary !== current.summary ||
        nextImportant !== current.important ||
        nextConfirmationStatus !== current.confirmationStatus;

      if (!changed) {
        return toDetail(current);
      }

      const updated = await transaction.timelineEvent.updateMany({
        where: {
          id: current.id,
          datasetId: command.context.datasetId,
          version: command.expectedVersion,
        },
        data: {
          summary: nextSummary,
          important: nextImportant,
          confirmationStatus: nextConfirmationStatus,
          updatedByActorId: command.context.actorId,
          updatedAt: command.now,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new VersionConflictError(command.expectedVersion);
      }

      await transaction.timelineEventHistory.create({
        data: {
          datasetId: command.context.datasetId,
          timelineEventId: current.id,
          actorId: command.context.actorId,
          editedAt: command.now,
          version: current.version + 1,
          previousSummary: current.summary,
          nextSummary,
          previousImportant: current.important,
          nextImportant,
          previousConfirmationStatus: current.confirmationStatus,
          nextConfirmationStatus,
        },
      });

      const refreshed = await transaction.timelineEvent.findFirst({
        where: {
          id: current.id,
          datasetId: command.context.datasetId,
        },
        select: TIMELINE_EVENT_SELECT,
      });

      if (!refreshed) {
        throw new TimelineEventNotFoundError();
      }

      return toDetail(refreshed);
    });
  }

  async history(input: {
    context: UpdateTimelineEventCommand['context'];
    eventId: string;
    now: Date;
  }): Promise<readonly TimelineEventHistoryItem[]> {
    await this.findAccessibleEvent(
      this.prisma,
      input.context,
      input.eventId,
      input.now,
    );

    const rows = await this.prisma.timelineEventHistory.findMany({
      where: {
        datasetId: input.context.datasetId,
        timelineEventId: input.eventId,
      },
      orderBy: [{ editedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        actorId: true,
        editedAt: true,
        version: true,
        previousSummary: true,
        nextSummary: true,
        previousImportant: true,
        nextImportant: true,
        previousConfirmationStatus: true,
        nextConfirmationStatus: true,
      },
    });

    return rows.map((row) => ({
      historyEntryId: row.id,
      actorId: row.actorId,
      editedAt: row.editedAt,
      version: row.version,
      changes: {
        ...(row.previousSummary === row.nextSummary
          ? {}
          : {
              summary: {
                before: row.previousSummary,
                after: row.nextSummary,
              },
            }),
        ...(row.previousImportant === row.nextImportant
          ? {}
          : {
              important: {
                before: row.previousImportant,
                after: row.nextImportant,
              },
            }),
        ...(row.previousConfirmationStatus === row.nextConfirmationStatus
          ? {}
          : {
              confirmationStatus: {
                before: row.previousConfirmationStatus,
                after: row.nextConfirmationStatus,
              },
            }),
      },
    }));
  }

  private async findAccessibleEvent(
    client: DatabaseClient,
    context: UpdateTimelineEventCommand['context'],
    eventId: string,
    now: Date,
  ): Promise<TimelineEventRow> {
    const event = await client.timelineEvent.findFirst({
      where: {
        id: eventId,
        datasetId: context.datasetId,
        wardId: context.wardId,
        patient: {
          patientAssignments: {
            some: {
              datasetId: context.datasetId,
              wardId: context.wardId,
              nurseId: context.actorId,
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gte: now } }],
            },
          },
        },
      },
      select: TIMELINE_EVENT_SELECT,
    });

    if (!event) {
      throw new TimelineEventNotFoundError();
    }

    return event;
  }
}

function toDetail(row: TimelineEventRow): TimelineEventDetail {
  return {
    eventId: row.id,
    patientId: row.patientId,
    occurredAt: row.occurredAt,
    type: row.type,
    source: row.source,
    sourceReference: row.sourceReference,
    summary: row.summary,
    important: row.important,
    confirmationStatus: row.confirmationStatus,
    version: row.version,
    updatedAt: row.updatedAt,
    updatedByActorId: row.updatedByActorId,
  };
}
