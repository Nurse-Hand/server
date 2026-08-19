import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  TaskExtractionEvidencePort,
  TaskExtractionEvidenceSnapshot,
} from '../application/ports/task-extraction-evidence.port';
import { deriveSeoulWorkDate } from '../domain/task-work-date';

@Injectable()
export class DeterministicTaskExtractionEvidenceAdapter implements TaskExtractionEvidencePort {
  constructor(private readonly prisma: PrismaService) {}

  async read(input: {
    context: { datasetId: string; wardId: string };
    roundingSessionId: string;
    recordIds: readonly string[];
  }): Promise<TaskExtractionEvidenceSnapshot> {
    const recordIds = [...new Set(input.recordIds)];
    if (recordIds.length === 0) {
      return { roundingSessionId: input.roundingSessionId, evidence: [] };
    }

    const segments = await this.prisma.roundingPatientSegment.findMany({
      where: {
        id: { in: recordIds },
        datasetId: input.context.datasetId,
        roundingSessionId: input.roundingSessionId,
        wardId: input.context.wardId,
      },
      select: {
        id: true,
        patientId: true,
        sequence: true,
        startedAt: true,
        endedAt: true,
        note: true,
      },
    });
    const segmentById = new Map(
      segments.map((segment) => [segment.id, segment]),
    );
    const orderedSegments = recordIds.flatMap((recordId) => {
      const segment = segmentById.get(recordId);
      return segment ? [segment] : [];
    });
    if (orderedSegments.length === 0) {
      return { roundingSessionId: input.roundingSessionId, evidence: [] };
    }

    return {
      roundingSessionId: input.roundingSessionId,
      evidence: orderedSegments.map((segment) => ({
        recordId: segment.id,
        sourceType: 'ROUNDING_SEGMENT' as const,
        sourceId: segment.id,
        patientId: segment.patientId,
        workDate: deriveSeoulWorkDate(segment.startedAt),
        summary:
          segment.note ?? `Synthetic rounding segment ${segment.sequence}`,
      })),
    };
  }
}
