import { ApplicationError } from '../../../common/errors/application.error';
import type { StoredFileKind } from './file-kind';

export class FileRequiredError extends ApplicationError {
  constructor() {
    super({
      code: 'FILE_REQUIRED',
      kind: 'BAD_REQUEST',
      publicMessage: '업로드할 파일이 필요합니다.',
    });
    this.name = FileRequiredError.name;
  }
}

export class FileNameInvalidError extends ApplicationError {
  constructor() {
    super({
      code: 'FILE_NAME_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '파일 이름이 올바르지 않습니다.',
    });
    this.name = FileNameInvalidError.name;
  }
}

export class FileEmptyError extends ApplicationError {
  constructor() {
    super({
      code: 'FILE_EMPTY',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '빈 파일은 업로드할 수 없습니다.',
    });
    this.name = FileEmptyError.name;
  }
}

export class FileSizeExceededError extends ApplicationError {
  constructor(kind: StoredFileKind, maxSizeBytes: number) {
    super({
      code: 'FILE_SIZE_EXCEEDED',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '파일 크기가 허용 범위를 초과했습니다.',
      publicDetails: {
        kind,
        maxSizeBytes,
      },
    });
    this.name = FileSizeExceededError.name;
  }
}

export class FileMimeTypeInvalidError extends ApplicationError {
  constructor(
    kind: StoredFileKind,
    mimeType: string,
    allowedMimeTypes: string[],
  ) {
    super({
      code: 'FILE_MIME_TYPE_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '지원하지 않는 MIME type입니다.',
      publicDetails: {
        kind,
        mimeType,
        allowedMimeTypes,
      },
    });
    this.name = FileMimeTypeInvalidError.name;
  }
}

export class FileExtensionInvalidError extends ApplicationError {
  constructor(
    kind: StoredFileKind,
    extension: string,
    allowedExtensions: string[],
  ) {
    super({
      code: 'FILE_EXTENSION_INVALID',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage: '지원하지 않는 파일 확장자입니다.',
      publicDetails: {
        kind,
        extension,
        allowedExtensions,
      },
    });
    this.name = FileExtensionInvalidError.name;
  }
}

export class FileStorageWriteFailedError extends ApplicationError {
  constructor() {
    super({
      code: 'FILE_STORAGE_WRITE_FAILED',
      kind: 'INTERNAL_ERROR',
      publicMessage: '파일을 저장할 수 없습니다.',
    });
    this.name = FileStorageWriteFailedError.name;
  }
}
