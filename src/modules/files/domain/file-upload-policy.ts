import { basename, extname } from 'node:path';
import {
  FileEmptyError,
  FileExtensionInvalidError,
  FileMimeTypeInvalidError,
  FileNameInvalidError,
  FileSizeExceededError,
} from './file.errors';
import type { StoredFileKind } from './file-kind';

type StoredFileUploadPolicy = {
  maxSizeBytes: number;
  extensionsByMimeType: Readonly<Record<string, readonly string[]>>;
};

export type StoredFileValidationInput = {
  kind: StoredFileKind;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};

export type ValidatedStoredFile = {
  extension: string;
  kind: StoredFileKind;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};

const MEBIBYTE = 1024 * 1024;

const STORED_FILE_UPLOAD_POLICIES: Readonly<
  Record<StoredFileKind, StoredFileUploadPolicy>
> = {
  AUDIO: {
    maxSizeBytes: 25 * MEBIBYTE,
    extensionsByMimeType: {
      'audio/aac': ['.aac'],
      'audio/flac': ['.flac'],
      'audio/m4a': ['.m4a'],
      'audio/mp4': ['.m4a'],
      'audio/mpeg': ['.mp3'],
      'audio/ogg': ['.ogg'],
      'audio/wav': ['.wav'],
      'audio/webm': ['.webm'],
      'audio/x-m4a': ['.m4a'],
      'audio/x-wav': ['.wav'],
      'video/mp4': ['.m4a'],
    },
  },
  PHOTO: {
    maxSizeBytes: 10 * MEBIBYTE,
    extensionsByMimeType: {
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
  },
};

export function readStoredFileUploadPolicy(
  kind: StoredFileKind,
): StoredFileUploadPolicy {
  return STORED_FILE_UPLOAD_POLICIES[kind];
}

export function validateStoredFileUpload(
  input: StoredFileValidationInput,
): ValidatedStoredFile {
  const policy = readStoredFileUploadPolicy(input.kind);
  const originalName = basename(input.originalName).trim();

  if (originalName.length === 0 || originalName.length > 255) {
    throw new FileNameInvalidError();
  }

  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new FileEmptyError();
  }

  if (input.sizeBytes > policy.maxSizeBytes) {
    throw new FileSizeExceededError(input.kind, policy.maxSizeBytes);
  }

  const extension = extname(originalName).toLowerCase();
  const mimeType = normalizeMimeType(input.mimeType);
  const allowedExtensions = policy.extensionsByMimeType[mimeType];

  if (!allowedExtensions) {
    throw new FileMimeTypeInvalidError(
      input.kind,
      mimeType,
      listAllowedMimeTypes(policy),
    );
  }

  if (!allowedExtensions.includes(extension)) {
    throw new FileExtensionInvalidError(
      input.kind,
      extension,
      listAllowedExtensions(policy),
    );
  }

  return {
    extension,
    kind: input.kind,
    mimeType,
    originalName,
    sizeBytes: input.sizeBytes,
  };
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function listAllowedMimeTypes(policy: StoredFileUploadPolicy): string[] {
  return Object.keys(policy.extensionsByMimeType).sort();
}

function listAllowedExtensions(policy: StoredFileUploadPolicy): string[] {
  return Array.from(
    new Set(
      Object.values(policy.extensionsByMimeType).flatMap((extensions) =>
        Array.from(extensions),
      ),
    ),
  ).sort();
}
