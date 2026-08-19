import { createHash } from 'node:crypto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { FileRequiredError } from '../domain/file.errors';
import { FilesService } from './files.service';
import type { FileStorage } from './ports/file-storage.port';
import type { StoredFileRepository } from './ports/stored-file.repository';
import type { UploadedFilePayload } from './uploaded-file';

function createUploadFile(): UploadedFilePayload {
  const buffer = Buffer.from('synthetic-audio-bytes');

  return {
    buffer,
    mimetype: 'audio/mp4',
    originalname: 'rounding-note.m4a',
  };
}

describe('FilesService', () => {
  const demoContext: DemoSessionContext = {
    actorId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d62',
    datasetId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d60',
    wardId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d61',
  };
  let fileStorage: jest.Mocked<FileStorage>;
  let storedFileRepository: jest.Mocked<StoredFileRepository>;
  let service: FilesService;

  beforeEach(() => {
    fileStorage = {
      delete: jest.fn(),
      store: jest.fn(),
    };
    storedFileRepository = {
      create: jest.fn(),
    };
    service = new FilesService(fileStorage, storedFileRepository);
  });

  it('검증된 파일을 저장소와 repository에 순서대로 전달한다', async () => {
    const file = createUploadFile();
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const createdAt = new Date('2026-08-19T00:00:00.000Z');

    fileStorage.store.mockResolvedValue({
      storageUri: 'local:///audio/1234567890ab-upload.m4a',
    });
    storedFileRepository.create.mockResolvedValue({
      actorId: demoContext.actorId,
      checksum,
      createdAt,
      datasetId: demoContext.datasetId,
      id: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d63',
      kind: 'AUDIO',
      mimeType: 'audio/mp4',
      originalName: 'rounding-note.m4a',
      sizeBytes: file.buffer.length,
      storageUri: 'local:///audio/1234567890ab-upload.m4a',
      wardId: demoContext.wardId,
    });

    await expect(
      service.upload(demoContext, 'AUDIO', file),
    ).resolves.toMatchObject({
      checksum,
      id: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d63',
      kind: 'AUDIO',
      mimeType: 'audio/mp4',
      originalName: 'rounding-note.m4a',
      sizeBytes: file.buffer.length,
    });
    expect(fileStorage.store).toHaveBeenCalledWith({
      buffer: file.buffer,
      checksum,
      extension: '.m4a',
      kind: 'AUDIO',
    });
    expect(storedFileRepository.create).toHaveBeenCalledWith({
      actorId: demoContext.actorId,
      checksum,
      datasetId: demoContext.datasetId,
      kind: 'AUDIO',
      mimeType: 'audio/mp4',
      originalName: 'rounding-note.m4a',
      sizeBytes: file.buffer.length,
      storageUri: 'local:///audio/1234567890ab-upload.m4a',
      wardId: demoContext.wardId,
    });
  });

  it('repository 저장이 실패하면 저장된 파일을 정리한다', async () => {
    const file = createUploadFile();
    const persistenceError = new Error('db-write-failed');

    fileStorage.store.mockResolvedValue({
      storageUri: 'local:///audio/cleanup-target.m4a',
    });
    storedFileRepository.create.mockRejectedValue(persistenceError);

    await expect(service.upload(demoContext, 'AUDIO', file)).rejects.toBe(
      persistenceError,
    );
    expect(fileStorage.delete).toHaveBeenCalledWith(
      'local:///audio/cleanup-target.m4a',
    );
  });

  it('file이 없으면 바로 거부한다', async () => {
    await expect(
      service.upload(demoContext, 'PHOTO', undefined),
    ).rejects.toThrow(FileRequiredError);
    expect(fileStorage.store).not.toHaveBeenCalled();
    expect(storedFileRepository.create).not.toHaveBeenCalled();
  });
});
