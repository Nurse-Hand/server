import {
  FileExtensionInvalidError,
  FileMimeTypeInvalidError,
  FileSizeExceededError,
} from './file.errors';
import {
  readStoredFileUploadPolicy,
  validateStoredFileUpload,
} from './file-upload-policy';

describe('validateStoredFileUpload', () => {
  it('허용된 audio 파일은 정규화한 메타데이터를 반환한다', () => {
    expect(
      validateStoredFileUpload({
        kind: 'AUDIO',
        mimeType: 'audio/mp4',
        originalName: '../nested/rounding-note.m4a',
        sizeBytes: 1_024,
      }),
    ).toEqual({
      extension: '.m4a',
      kind: 'AUDIO',
      mimeType: 'audio/mp4',
      originalName: 'rounding-note.m4a',
      sizeBytes: 1_024,
    });
  });

  it('허용되지 않은 MIME type은 거부한다', () => {
    expect(() =>
      validateStoredFileUpload({
        kind: 'PHOTO',
        mimeType: 'application/pdf',
        originalName: 'capture.png',
        sizeBytes: 1_024,
      }),
    ).toThrow(FileMimeTypeInvalidError);
  });

  it('허용된 MIME type이어도 확장자가 다르면 거부한다', () => {
    expect(() =>
      validateStoredFileUpload({
        kind: 'AUDIO',
        mimeType: 'audio/mpeg',
        originalName: 'voice.wav',
        sizeBytes: 2_048,
      }),
    ).toThrow(FileExtensionInvalidError);
  });

  it('kind별 최대 크기를 초과하면 거부한다', () => {
    const { maxSizeBytes } = readStoredFileUploadPolicy('AUDIO');

    expect(() =>
      validateStoredFileUpload({
        kind: 'AUDIO',
        mimeType: 'audio/webm',
        originalName: 'shift-summary.webm',
        sizeBytes: maxSizeBytes + 1,
      }),
    ).toThrow(FileSizeExceededError);
  });
});
