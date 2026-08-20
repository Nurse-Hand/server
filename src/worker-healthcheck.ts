import { isWorkerHeartbeatFresh } from './worker-heartbeat';

async function main(): Promise<void> {
  process.exitCode = (await isWorkerHeartbeatFresh()) ? 0 : 1;
}

void main().catch(() => {
  process.exitCode = 1;
});
