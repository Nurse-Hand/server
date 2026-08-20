import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const storageRoot = process.env.FILE_STORAGE_ROOT;

if (!storageRoot || !isAbsolute(storageRoot)) {
  throw new Error('FILE_STORAGE_ROOT must be an absolute path.');
}

const smokeDirectory = join(storageRoot, 'tmp');
const smokeId = randomUUID();
const temporaryPath = join(smokeDirectory, `.deploy-smoke-${smokeId}.part`);
const renamedPath = join(smokeDirectory, `.deploy-smoke-${smokeId}.ready`);

await mkdir(smokeDirectory, { recursive: true });

try {
  await writeFile(temporaryPath, 'nurse-hand-storage-smoke', {
    encoding: 'utf8',
    flag: 'wx',
  });
  await rename(temporaryPath, renamedPath);

  const stored = await stat(renamedPath);
  if (!stored.isFile()) {
    throw new Error('Storage smoke artifact is not a regular file.');
  }
} finally {
  await rm(temporaryPath, { force: true });
  await rm(renamedPath, { force: true });
}

process.stdout.write('storage permission smoke passed\n');
