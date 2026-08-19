import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScheduleOcrStorage } from '../application/ports/schedule-ocr-storage.port';

@Injectable()
export class LocalScheduleOcrStorageAdapter implements ScheduleOcrStorage {
  private readonly directory: string;

  constructor(config: ConfigService) {
    this.directory = join(
      config.getOrThrow<string>('FILE_STORAGE_ROOT'),
      'schedule-ocr',
    );
  }

  async store(buffer: Buffer, extension: string): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const name = `${randomUUID()}${extension}`;
    await writeFile(join(this.directory, name), buffer);
    return `schedule-ocr://${name}`;
  }

  async delete(storageUri: string): Promise<void> {
    await rm(this.path(storageUri), { force: true }).catch(() => undefined);
  }

  async sweepOrphans(olderThan: Date): Promise<number> {
    await mkdir(this.directory, { recursive: true });
    let deleted = 0;
    for (const name of await readdir(this.directory)) {
      const path = join(this.directory, name);
      if ((await stat(path)).mtime < olderThan) {
        await rm(path, { force: true });
        deleted += 1;
      }
    }
    return deleted;
  }

  private path(uri: string): string {
    const url = new URL(uri);
    if (
      url.protocol !== 'schedule-ocr:' ||
      !url.hostname ||
      url.hostname.includes('..')
    ) {
      throw new TypeError('올바르지 않은 OCR storage URI입니다.');
    }
    return join(this.directory, url.hostname);
  }
}
