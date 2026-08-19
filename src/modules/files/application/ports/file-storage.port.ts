import type { StoredFileKind } from '../../domain/file-kind';

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export type StoreFileCommand = {
  buffer: Buffer;
  checksum: string;
  extension: string;
  kind: StoredFileKind;
};

export type StoredObject = {
  storageUri: string;
};

export interface FileStorage {
  delete(storageUri: string): Promise<void>;
  store(command: StoreFileCommand): Promise<StoredObject>;
}
