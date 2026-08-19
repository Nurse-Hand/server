import type { StoredFileKind } from '../../domain/file-kind';

export const STORED_FILE_REPOSITORY = Symbol('STORED_FILE_REPOSITORY');

export type CreateStoredFileRecordInput = {
  actorId: string;
  checksum: string;
  datasetId: string;
  kind: StoredFileKind;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  storageUri: string;
  wardId: string;
};

export type StoredFileRecord = CreateStoredFileRecordInput & {
  createdAt: Date;
  id: string;
};

export interface StoredFileRepository {
  create(input: CreateStoredFileRecordInput): Promise<StoredFileRecord>;
}
