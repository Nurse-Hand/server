import { DeterministicScheduleOcrGateway } from './deterministic-schedule-ocr.gateway';

describe('DeterministicScheduleOcrGateway', () => {
  it('같은 합성 입력에는 날짜별 동일 후보를 반환한다', async () => {
    const gateway = new DeterministicScheduleOcrGateway();
    const input = {
      image: Buffer.from('synthetic-schedule'),
      yearMonth: '2026-08',
      templateId: 'FIXED_V1',
      rowIndex: 2,
      requestId: '00000000-0000-4000-8000-000000000001',
    };
    const first = await gateway.recognize(input);
    const second = await gateway.recognize(input);
    expect(first).toEqual(second);
    expect(first).toHaveLength(31);
    expect(first.map(({ day }) => day)).toEqual(
      Array.from({ length: 31 }, (_, index) => index + 1),
    );
  });
});
