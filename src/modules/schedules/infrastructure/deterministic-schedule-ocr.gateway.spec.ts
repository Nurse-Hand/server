import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ScheduleOcrEngineUnavailableError } from '../domain/schedule.errors';
import { DeterministicScheduleOcrGateway } from './deterministic-schedule-ocr.gateway';
import {
  createSyntheticScheduleFixture,
  SYNTHETIC_SCHEDULE_FIXTURE_SHA256,
} from './synthetic-schedule-fixture';

describe('DeterministicScheduleOcrGateway', () => {
  it('같은 합성 입력에는 날짜별 동일 후보를 반환한다', async () => {
    const gateway = new DeterministicScheduleOcrGateway(
      new ConfigService({ DEMO_MODE: true }),
    );
    const input = {
      image: createSyntheticScheduleFixture(),
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

  it('fixture bytes의 exact SHA-256을 고정한다', () => {
    expect(
      createHash('sha256')
        .update(createSyntheticScheduleFixture())
        .digest('hex'),
    ).toBe(SYNTHETIC_SCHEDULE_FIXTURE_SHA256);
  });

  it.each([
    ['non-DEMO', false, createSyntheticScheduleFixture(), 2],
    ['allowlist 밖 이미지', true, Buffer.from('not-a-fixture'), 2],
    ['허용되지 않은 row', true, createSyntheticScheduleFixture(), 3],
  ])(
    '%s는 수동 등록 안내와 함께 fail closed한다',
    async (_name, demoMode, image, rowIndex) => {
      const gateway = new DeterministicScheduleOcrGateway(
        new ConfigService({ DEMO_MODE: demoMode }),
      );
      await expect(
        gateway.recognize({
          image,
          yearMonth: '2026-08',
          templateId: 'FIXED_V1',
          rowIndex,
          requestId: '00000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toBeInstanceOf(ScheduleOcrEngineUnavailableError);
    },
  );
});
