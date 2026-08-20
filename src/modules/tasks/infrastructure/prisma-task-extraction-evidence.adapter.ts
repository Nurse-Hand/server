import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  TaskExtractionEvidence,
  TaskExtractionEvidencePort,
  TaskExtractionEvidenceSnapshot,
} from '../application/ports/task-extraction-evidence.port';
import { deriveSeoulWorkDate } from '../domain/task-work-date';

@Injectable()
export class PrismaTaskExtractionEvidenceAdapter
  implements TaskExtractionEvidencePort
{
  constructor(private readonly prisma: PrismaService) {}

  async read(input: {
    context: {
      datasetId: string;
      actorId: string;
      wardId: string;
    };
    roundingSessionId: string;
    recordIds: readonly string[];
  }): Promise<TaskExtractionEvidenceSnapshot> {
    const recordIds = [...new Set(input.recordIds)];
    const [timelineEvents, tasks] = await Promise.all([
      this.prisma.timelineEvent.findMany({
        where: {
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          id: { in: recordIds },
        },
        select: {
          id: true,
          patientId: true,
          occurredAt: true,
          summary: true,
        },
      }),
      this.prisma.task.findMany({
        where: {
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          actorId: input.context.actorId,
          id: { in: recordIds },
        },
        select: {
          id: true,
          patientId: true,
          workDate: true,
          title: true,
          description: true,
        },
      }),
    ]);

    const timelineById = new Map(timelineEvents.map((event) => [event.id, event]));
    const taskById = new Map(tasks.map((task) => [task.id, task]));

    return {
      roundingSessionId: input.roundingSessionId,
      evidence: recordIds.flatMap(
        (recordId): TaskExtractionEvidence[] => {
        const timeline = timelineById.get(recordId);
        if (timeline) {
          return [
            {
              recordId,
              sourceType: 'TIMELINE_EVENT' as const,
              sourceId: timeline.id,
              patientId: timeline.patientId,
              workDate: deriveSeoulWorkDate(timeline.occurredAt),
              summary: clipSummary(timeline.summary),
            },
          ];
        }

        const task = taskById.get(recordId);
        if (task) {
          return [
            {
              recordId,
              sourceType: 'TASK' as const,
              sourceId: task.id,
              patientId: task.patientId,
              workDate: task.workDate,
              summary: clipSummary([task.title, task.description].filter(Boolean).join(' - ')),
            },
          ];
        }

        return [];
        },
      ),
    };
  }
}

function clipSummary(value: string): string {
  const normalized = value.trim();
  return normalized.length <= 500 ? normalized : normalized.slice(0, 497) + '...';
}
