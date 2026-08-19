import { ScheduleOcrFileInvalidError } from './schedule.errors';
import { validateScheduleImage } from './schedule-image-policy';

function png(width = 640, height = 480): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('schedule image policy', () => {
  it('PNG signature와 해상도를 함께 검증한다', () => {
    expect(
      validateScheduleImage({
        buffer: png(),
        mimeType: 'image/png',
        originalName: 'synthetic.png',
        sizeBytes: 24,
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
        buffer: png(100, 100),
        mimeType: 'image/png',
        originalName: 'synthetic.png',
        sizeBytes: 24,
      }),
    ).toThrow(ScheduleOcrFileInvalidError);
  });
});
