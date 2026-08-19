import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ScheduleOcrCandidate,
  ScheduleOcrGateway,
  ScheduleOcrGatewayInput,
} from '../application/ports/schedule-ocr.gateway';
import { daysInYearMonth } from '../domain/schedule-policy';

@Injectable()
export class DeterministicScheduleOcrGateway implements ScheduleOcrGateway {
  async recognize(
    input: ScheduleOcrGatewayInput,
  ): Promise<ScheduleOcrCandidate[]> {
    const seed =
      createHash('sha256')
        .update(input.image)
        .update(input.templateId)
        .update(String(input.rowIndex))
        .digest()[0] ?? 0;
    const tokens = ['D', 'E', 'N', 'OFF'] as const;
    return Array.from(
      { length: daysInYearMonth(input.yearMonth) },
      (_, index) => {
        const isUnknown = (seed + index + 1) % 11 === 0;
        return {
          day: index + 1,
          token: isUnknown
            ? 'UNKNOWN'
            : tokens[(seed + index) % tokens.length]!,
          confidence: isUnknown ? 0.4 : 0.99,
        };
      },
    );
  }
}
