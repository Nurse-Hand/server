import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { FilesService } from '../application/files.service';
import type { UploadedFilePayload } from '../application/uploaded-file';
import { FilesController } from './files.controller';
import { toStoredFileDataDto } from './stored-file.response.dto';

function createUploadFile(): UploadedFilePayload {
  const buffer = Buffer.from('synthetic-upload');

  return {
    buffer,
    mimetype: 'audio/mp4',
    originalname: 'rounding-note.m4a',
  };
}

describe('FilesController', () => {
  const createdAt = new Date('2026-08-19T00:00:00.000Z');
  const demoContext: DemoSessionContext = {
    actorId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d62',
    datasetId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d60',
    wardId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d61',
  };
  const uploadResult = {
    actorId: demoContext.actorId,
    checksum:
      'f8ae677a835c417379ac9867a8d316afd95f0f3d36cb8d6f7cefeaa2e5ec9d27',
    createdAt,
    datasetId: demoContext.datasetId,
    id: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d63',
    kind: 'AUDIO' as const,
    mimeType: 'audio/mp4',
    originalName: 'rounding-note.m4a',
    sizeBytes: 16,
    storageUri: 'local:///audio/rounding-note.m4a',
    wardId: demoContext.wardId,
  };

  it('audio endpoint는 AUDIO kind로 service를 호출한다', async () => {
    const filesService = {
      upload: jest.fn().mockResolvedValue(uploadResult),
    };
    const controller = new FilesController(
      filesService as unknown as FilesService,
    );
    const file = createUploadFile();

    await expect(controller.uploadAudio(demoContext, file)).resolves.toEqual(
      toStoredFileDataDto(uploadResult),
    );
    expect(filesService.upload).toHaveBeenCalledWith(
      demoContext,
      'AUDIO',
      file,
    );
  });

  it('photo endpoint는 PHOTO kind로 service를 호출한다', async () => {
    const filesService = {
      upload: jest.fn().mockResolvedValue({
        ...uploadResult,
        kind: 'PHOTO',
        mimeType: 'image/png',
        originalName: 'ward-board.png',
      }),
    };
    const controller = new FilesController(
      filesService as unknown as FilesService,
    );
    const file = {
      ...createUploadFile(),
      mimetype: 'image/png',
      originalname: 'ward-board.png',
    } as UploadedFilePayload;

    await expect(controller.uploadPhoto(demoContext, file)).resolves.toEqual({
      ...toStoredFileDataDto(uploadResult),
      kind: 'PHOTO',
      mimeType: 'image/png',
      originalName: 'ward-board.png',
    });
    expect(filesService.upload).toHaveBeenCalledWith(
      demoContext,
      'PHOTO',
      file,
    );
  });
});
