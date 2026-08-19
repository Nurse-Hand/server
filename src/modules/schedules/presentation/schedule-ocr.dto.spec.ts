import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateScheduleOcrJobRequestDto } from './schedule-ocr.dto';

describe('CreateScheduleOcrJobRequestDto', () => {
  async function rowErrors(rowIndex: unknown): Promise<number> {
    const dto = plainToInstance(CreateScheduleOcrJobRequestDto, {
      yearMonth: '2026-08',
      templateId: 'FIXED_V1',
      rowIndex,
    });
    return (await validate(dto)).filter(
      ({ property }) => property === 'rowIndex',
    ).length;
  }

  it('정확한 decimal literal rowIndex만 변환한다', async () => {
    await expect(rowErrors('2')).resolves.toBe(0);
  });

  it.each(['', ' 2', '2 ', '2.0', '2e0', '+2', '-2'])(
    'rowIndex %p를 관대한 숫자 변환으로 허용하지 않는다',
    async (rowIndex) => {
      await expect(rowErrors(rowIndex)).resolves.toBeGreaterThan(0);
    },
  );
});
