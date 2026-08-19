export const SCHEDULE_OCR_STORAGE = Symbol('SCHEDULE_OCR_STORAGE');

export interface ScheduleOcrStorage {
  delete(storageUri: string): Promise<void>;
  store(buffer: Buffer, extension: string): Promise<string>;
  sweepOrphans(olderThan: Date): Promise<number>;
}
