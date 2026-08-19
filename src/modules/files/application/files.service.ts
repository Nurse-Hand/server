import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FileRequiredError } from '../domain/file.errors';
import type { StoredFileKind } from '../domain/file-kind';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { validateStoredFileUpload } from '../domain/file-upload-policy';
import { FILE_STORAGE, type FileStorage } from './ports/file-storage.port';
import {
  STORED_FILE_REPOSITORY,
  type StoredFileRecord,
  type StoredFileRepository,
} from './ports/stored-file.repository';
import type { UploadedFilePayload } from './uploaded-file';

@Injectable()
export class FilesService {
  constructor(
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
    @Inject(STORED_FILE_REPOSITORY)
    private readonly storedFileRepository: StoredFileRepository,
  ) {}

  async upload(
    context: DemoSessionContext,
    kind: StoredFileKind,
    file: UploadedFilePayload | undefined,
  ): Promise<StoredFileRecord> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new FileRequiredError();
    }

    const validated = validateStoredFileUpload({
      kind,
      mimeType: file.mimetype,
      originalName: file.originalname,
      sizeBytes: file.buffer.length,
    });
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storedObject = await this.fileStorage.store({
      buffer: file.buffer,
      checksum,
      extension: validated.extension,
      kind,
    });

    try {
      return await this.storedFileRepository.create({
        actorId: context.actorId,
        checksum,
        datasetId: context.datasetId,
        kind,
        mimeType: validated.mimeType,
        originalName: validated.originalName,
        sizeBytes: validated.sizeBytes,
        storageUri: storedObject.storageUri,
        wardId: context.wardId,
      });
    } catch (error) {
      try {
        await this.fileStorage.delete(storedObject.storageUri);
      } catch {
        // Cleanup failure must not hide the original persistence error.
      }
      throw error;
    }
  }
}
