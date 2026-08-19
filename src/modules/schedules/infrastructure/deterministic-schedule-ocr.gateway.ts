import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ScheduleOcrCandidate,
  ScheduleOcrGateway,
  ScheduleOcrGatewayInput,
} from '../application/ports/schedule-ocr.gateway';
import { daysInYearMonth } from '../domain/schedule-policy';
import { ScheduleOcrEngineUnavailableError } from '../domain/schedule.errors';
import { isAllowedSyntheticScheduleFixture } from '../domain/synthetic-schedule-fixture-registry';

@Injectable()
export class DeterministicScheduleOcrGateway implements ScheduleOcrGateway {
  constructor(private readonly config: ConfigService) {}

  async recognize(
    input: ScheduleOcrGatewayInput,
  ): Promise<ScheduleOcrCandidate[]> {
    if (!this.config.get<boolean>('DEMO_MODE')) {
      throw new ScheduleOcrEngineUnavailableError();
    }
    const hash = createHash('sha256').update(input.image).digest('hex');
    if (
      !isAllowedSyntheticScheduleFixture({
        fileHash: hash,
        templateId: input.templateId,
        rowIndex: input.rowIndex,
        width: 640,
        height: 480,
      })
    ) {
      throw new ScheduleOcrEngineUnavailableError();
    }
    const tokens = ['D', 'E', 'N', 'OFF'] as const;
    return Array.from(
      { length: daysInYearMonth(input.yearMonth) },
      (_, index) => {
        const isUnknown = (index + 1) % 11 === 0;
        return {
          day: index + 1,
          token: isUnknown ? 'UNKNOWN' : tokens[index % tokens.length]!,
          confidence: isUnknown ? 0.4 : 0.99,
        };
      },
    );
  }
}
