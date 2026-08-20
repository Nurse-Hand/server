import { readFile, rm, writeFile } from 'node:fs/promises';

export const WORKER_HEARTBEAT_PATH = '/tmp/nurse-hand-worker-heartbeat';
export const WORKER_HEARTBEAT_MAX_AGE_MILLISECONDS = 120_000;

export async function clearWorkerHeartbeat(
  path = WORKER_HEARTBEAT_PATH,
): Promise<void> {
  await rm(path, { force: true });
}

export async function writeWorkerHeartbeat(
  nowMilliseconds = Date.now(),
  path = WORKER_HEARTBEAT_PATH,
): Promise<void> {
  await writeFile(path, `${nowMilliseconds}\n`, {
    encoding: 'utf8',
    flag: 'w',
    mode: 0o600,
  });
}

export async function isWorkerHeartbeatFresh(
  nowMilliseconds = Date.now(),
  path = WORKER_HEARTBEAT_PATH,
  maxAgeMilliseconds = WORKER_HEARTBEAT_MAX_AGE_MILLISECONDS,
): Promise<boolean> {
  try {
    const rawTimestamp = (await readFile(path, 'utf8')).trim();
    if (!/^\d{13}$/.test(rawTimestamp)) return false;

    const heartbeatMilliseconds = Number(rawTimestamp);
    const ageMilliseconds = nowMilliseconds - heartbeatMilliseconds;
    return ageMilliseconds >= 0 && ageMilliseconds <= maxAgeMilliseconds;
  } catch {
    return false;
  }
}
