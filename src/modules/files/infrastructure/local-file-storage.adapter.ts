import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorageWriteFailedError } from '../domain/file.errors';
import {
  STORED_FILE_DIRECTORY_BY_KIND,
  type StoredFileKind,
} from '../domain/file-kind';
import type {
  FileStorage,
  StoreFileCommand,
  StoredObject,
} from '../application/ports/file-storage.port';

const LOCAL_STORAGE_URI_PREFIX = 'local:///';

@Injectable()
export class LocalFileStorageAdapter implements FileStorage {
  private readonly rootPath: string;

  constructor(configService: ConfigService) {
    this.rootPath = configService.getOrThrow<string>('FILE_STORAGE_ROOT');
  }

  async store(command: StoreFileCommand): Promise<StoredObject> {
    await this.ensureDirectories();

    const tempRelativePath = `tmp/${randomUUID()}${command.extension}`;
    const finalRelativePath = `${directoryForKind(command.kind)}/${command.checksum.slice(0, 12)}-${randomUUID()}${command.extension}`;
    const tempAbsolutePath = this.resolveAbsolutePath(tempRelativePath);
    const finalAbsolutePath = this.resolveAbsolutePath(finalRelativePath);

    try {
      await writeFile(tempAbsolutePath, command.buffer);
      await rename(tempAbsolutePath, finalAbsolutePath);

      return {
        storageUri: `${LOCAL_STORAGE_URI_PREFIX}${finalRelativePath}`,
      };
    } catch {
      await rm(tempAbsolutePath, { force: true }).catch(() => undefined);
      throw new FileStorageWriteFailedError();
    }
  }

  async delete(storageUri: string): Promise<void> {
    const relativePath = this.resolveRelativePath(storageUri);

    await rm(this.resolveAbsolutePath(relativePath), { force: true }).catch(
      () => undefined,
    );
  }

  private async ensureDirectories(): Promise<void> {
    await Promise.all([
      mkdir(this.resolveAbsolutePath('audio'), { recursive: true }),
      mkdir(this.resolveAbsolutePath('photos'), { recursive: true }),
      mkdir(this.resolveAbsolutePath('tmp'), { recursive: true }),
    ]);
  }

  private resolveAbsolutePath(relativePath: string): string {
    return join(this.rootPath, ...relativePath.split('/'));
  }

  private resolveRelativePath(storageUri: string): string {
    const url = new URL(storageUri);

    if (url.protocol !== 'local:') {
      throw new FileStorageWriteFailedError();
    }

    const relativePath = url.pathname.replace(/^\/+/, '');
    const directoryName = relativePath.split('/', 1)[0];

    if (
      (directoryName !== 'audio' && directoryName !== 'photos') ||
      relativePath.includes('..')
    ) {
      throw new FileStorageWriteFailedError();
    }

    return relativePath;
  }
}

function directoryForKind(kind: StoredFileKind): string {
  return STORED_FILE_DIRECTORY_BY_KIND[kind];
}
