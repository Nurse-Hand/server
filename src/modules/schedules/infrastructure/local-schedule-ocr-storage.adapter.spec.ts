import { ConfigService } from '@nestjs/config';
import { ScheduleOcrCleanupFailedError } from '../domain/schedule.errors';
import { LocalScheduleOcrStorageAdapter } from './local-schedule-ocr-storage.adapter';

const rmMock = jest.fn();
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  rm: (...args: unknown[]) => rmMock(...args),
  stat: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

describe('LocalScheduleOcrStorageAdapter delete', () => {
  const adapter = new LocalScheduleOcrStorageAdapter(
    new ConfigService({ FILE_STORAGE_ROOT: 'D:/synthetic-uploads' }),
  );

  beforeEach(() => rmMock.mockReset());

  it('ENOENT만 이미 삭제된 성공으로 처리한다', async () => {
    rmMock.mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );
    await expect(
      adapter.delete('schedule-ocr://00000000-0000-4000-8000-000000000105.png'),
    ).resolves.toBeUndefined();
  });

  it.each(['EACCES', 'EIO'])('%s 삭제 실패를 숨기지 않는다', async (code) => {
    rmMock.mockRejectedValueOnce(
      Object.assign(new Error('delete failed'), { code }),
    );
    await expect(
      adapter.delete('schedule-ocr://00000000-0000-4000-8000-000000000105.png'),
    ).rejects.toBeInstanceOf(ScheduleOcrCleanupFailedError);
  });

  it('jobId 기반 URI를 결정론적으로 만든다', () => {
    expect(
      adapter.resolveStorageUri('00000000-0000-4000-8000-000000000105', '.png'),
    ).toBe('schedule-ocr://00000000-0000-4000-8000-000000000105.png');
  });
});
