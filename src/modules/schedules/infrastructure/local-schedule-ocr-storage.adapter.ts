import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScheduleOcrStorage } from '../application/ports/schedule-ocr-storage.port';
import { ScheduleOcrCleanupFailedError } from '../domain/schedule.errors';

@Injectable()
export class LocalScheduleOcrStorageAdapter implements ScheduleOcrStorage {
  private readonly directory: string;

  constructor(config: ConfigService) {
    this.directory = join(
      config.getOrThrow<string>('FILE_STORAGE_ROOT'),
      'schedule-ocr',
    );
  }

  resolveStorageUri(jobId: string, extension: string): string {
    return `schedule-ocr://${jobId}${extension}`;
  }

  async store(storageUri: string, buffer: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.path(storageUri), buffer, { flag: 'wx' });
  }

  async delete(storageUri: string): Promise<void> {
    try {
      await rm(this.path(storageUri));
    } catch (error: unknown) {
      if (!isEnoent(error)) throw new ScheduleOcrCleanupFailedError();
    }
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

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
