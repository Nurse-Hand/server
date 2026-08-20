import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearWorkerHeartbeat,
  isWorkerHeartbeatFresh,
  writeWorkerHeartbeat,
} from './worker-heartbeat';

const NOW_MILLISECONDS = Date.parse('2026-08-20T13:00:00.000Z');

describe('worker heartbeat', () => {
  let directory: string;
  let heartbeatPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nurse-hand-worker-heartbeat-'));
    heartbeatPath = join(directory, 'heartbeat');
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('성공 cycle 시각을 기록하고 허용 구간 안에서 fresh로 판정한다', async () => {
    await writeWorkerHeartbeat(NOW_MILLISECONDS, heartbeatPath);

    await expect(readFile(heartbeatPath, 'utf8')).resolves.toBe(
      `${NOW_MILLISECONDS}\n`,
    );
    await expect(
      isWorkerHeartbeatFresh(
        NOW_MILLISECONDS + 119_999,
        heartbeatPath,
        120_000,
      ),
    ).resolves.toBe(true);
  });

  it('재시작 시 기존 heartbeat를 제거하고 첫 성공 cycle 뒤에만 healthy가 된다', async () => {
    await writeWorkerHeartbeat(NOW_MILLISECONDS - 1_000, heartbeatPath);

    await clearWorkerHeartbeat(heartbeatPath);
    await expect(
      isWorkerHeartbeatFresh(NOW_MILLISECONDS, heartbeatPath, 120_000),
    ).resolves.toBe(false);

    await writeWorkerHeartbeat(NOW_MILLISECONDS, heartbeatPath);
    await expect(
      isWorkerHeartbeatFresh(NOW_MILLISECONDS, heartbeatPath, 120_000),
    ).resolves.toBe(true);
  });

  it.each([
    ['누락', undefined],
    ['잘못된 형식', 'not-a-timestamp'],
    ['미래 시각', `${NOW_MILLISECONDS + 1}`],
    ['만료', `${NOW_MILLISECONDS - 120_001}`],
  ])('%s heartbeat는 unhealthy로 판정한다', async (_case, value) => {
    if (value !== undefined) {
      await writeFile(heartbeatPath, value, 'utf8');
    }

    await expect(
      isWorkerHeartbeatFresh(NOW_MILLISECONDS, heartbeatPath, 120_000),
    ).resolves.toBe(false);
  });
});
