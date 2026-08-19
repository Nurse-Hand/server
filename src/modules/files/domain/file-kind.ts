export const STORED_FILE_KINDS = ['AUDIO', 'PHOTO'] as const;

export type StoredFileKind = (typeof STORED_FILE_KINDS)[number];

export const STORED_FILE_DIRECTORY_BY_KIND: Readonly<
  Record<StoredFileKind, string>
> = {
  AUDIO: 'audio',
  PHOTO: 'photos',
};
