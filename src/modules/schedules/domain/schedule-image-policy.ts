import { extname } from 'node:path';
import { ScheduleOcrFileInvalidError } from './schedule.errors';
import {
  SCHEDULE_OCR_MAX_DIMENSION,
  SCHEDULE_OCR_MAX_FILE_BYTES,
  SCHEDULE_OCR_MAX_PIXEL_AREA,
  SCHEDULE_OCR_MIN_DIMENSION,
} from './schedule-policy';

export type ScheduleImageInput = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};
export type ValidatedScheduleImage = {
  extension: '.jpg' | '.jpeg' | '.png';
  width: number;
  height: number;
};

export function validateScheduleImage(
  input: ScheduleImageInput,
): ValidatedScheduleImage {
  if (
    input.sizeBytes <= 0 ||
    input.sizeBytes !== input.buffer.length ||
    input.sizeBytes > SCHEDULE_OCR_MAX_FILE_BYTES
  )
    throw new ScheduleOcrFileInvalidError();
  const extension = extname(input.originalName).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(extension))
    throw new ScheduleOcrFileInvalidError();
  const dimensions =
    input.mimeType === 'image/png' && extension === '.png'
      ? readPng(input.buffer)
      : input.mimeType === 'image/jpeg' &&
          (extension === '.jpg' || extension === '.jpeg')
        ? readJpeg(input.buffer)
        : null;
  if (
    !dimensions ||
    dimensions.width < SCHEDULE_OCR_MIN_DIMENSION ||
    dimensions.height < SCHEDULE_OCR_MIN_DIMENSION ||
    dimensions.width > SCHEDULE_OCR_MAX_DIMENSION ||
    dimensions.height > SCHEDULE_OCR_MAX_DIMENSION ||
    dimensions.width * dimensions.height > SCHEDULE_OCR_MAX_PIXEL_AREA
  )
    throw new ScheduleOcrFileInvalidError();
  return {
    extension: extension as ValidatedScheduleImage['extension'],
    ...dimensions,
  };
}

function readPng(buffer: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(signature) ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  )
    return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpeg(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
    return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) return null;
    if (marker >= 0xc0 && marker <= 0xc3)
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    offset += 2 + length;
  }
  return null;
}
