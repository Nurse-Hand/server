import { BadRequestException, type PipeTransform } from '@nestjs/common';

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const VISIBLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;

export class TaskIdempotencyKeyPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
      !VISIBLE_ASCII_PATTERN.test(value)
    ) {
      throw new BadRequestException({
        message: [
          `X-Idempotency-Key는 공백 없는 ASCII 1~${IDEMPOTENCY_KEY_MAX_LENGTH}자 문자열이어야 합니다.`,
        ],
      });
    }

    return value;
  }
}
