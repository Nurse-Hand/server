export const SCHEDULE_OCR_STORAGE = Symbol('SCHEDULE_OCR_STORAGE');

export interface ScheduleOcrStorage {
  delete(storageUri: string): Promise<void>;
  resolveStorageUri(jobId: string, extension: string): string;
  store(storageUri: string, buffer: Buffer): Promise<void>;
}
