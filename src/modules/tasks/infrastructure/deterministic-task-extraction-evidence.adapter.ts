import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import type {
  TaskExtractionEvidencePort,
  TaskExtractionEvidenceSnapshot,
} from '../application/ports/task-extraction-evidence.port';
import { deriveSeoulWorkDate } from '../domain/task-work-date';

@Injectable()
export class DeterministicTaskExtractionEvidenceAdapter implements TaskExtractionEvidencePort {
  constructor(private readonly clock: Clock) {}

  read(input: {
    roundingSessionId: string;
    recordIds: readonly string[];
  }): Promise<TaskExtractionEvidenceSnapshot> {
    const workDate = deriveSeoulWorkDate(this.clock.now());

    return Promise.resolve({
      roundingSessionId: input.roundingSessionId,
      evidence: [...new Set(input.recordIds)].map((recordId, index) => ({
        recordId,
        sourceType: 'TIMELINE_EVENT' as const,
        sourceId: recordId,
        patientId: null,
        workDate,
        summary: `Synthetic rounding evidence ${index + 1}`,
      })),
    });
  }
}
