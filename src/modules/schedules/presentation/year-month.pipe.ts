import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { isYearMonth } from '../domain/monthly-schedule.policy';

export class YearMonthPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !isYearMonth(value)) {
      throw new BadRequestException({
        message: [
          'yearMonth는 2000-01부터 2100-12 사이의 YYYY-MM이어야 합니다.',
        ],
      });
    }

    return value;
  }
}
