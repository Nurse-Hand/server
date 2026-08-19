import { ScheduleOcrFileInvalidError } from './schedule.errors';
import { validateScheduleImage } from './schedule-image-policy';
import { createSyntheticScheduleFixture } from '../infrastructure/synthetic-schedule-fixture';

describe('schedule image policy', () => {
  it('PNG signature와 해상도를 함께 검증한다', () => {
    expect(
      validateScheduleImage({
        buffer: createSyntheticScheduleFixture(),
        mimeType: 'image/png',
        originalName: 'synthetic.png',
        sizeBytes: createSyntheticScheduleFixture().length,
      }),
    ).toEqual({ extension: '.png', width: 640, height: 480 });
  });

  it('MIME과 signature가 다른 위장 파일을 거부한다', () => {
    expect(() =>
      validateScheduleImage({
        buffer: Buffer.alloc(24),
        mimeType: 'image/png',
        originalName: 'synthetic.png',
        sizeBytes: 24,
      }),
    ).toThrow(ScheduleOcrFileInvalidError);
  });

  it('최소 해상도보다 작은 이미지를 거부한다', () => {
    expect(() =>
      validateScheduleImage({
        buffer: createSyntheticScheduleFixture(100, 100),
        mimeType: 'image/png',
        originalName: 'synthetic.png',
        sizeBytes: createSyntheticScheduleFixture(100, 100).length,
      }),
    ).toThrow(ScheduleOcrFileInvalidError);
  });

  it('허용 pixel area를 넘는 압축 이미지를 거부한다', () => {
    const image = createSyntheticScheduleFixture(2_100, 2_000);
    expect(() =>
      validateScheduleImage({
        buffer: image,
        mimeType: 'image/png',
        originalName: 'synthetic.png',
        sizeBytes: image.length,
      }),
    ).toThrow(ScheduleOcrFileInvalidError);
  });
});
