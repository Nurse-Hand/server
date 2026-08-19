import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { isString, length } from 'class-validator';
import { MAX_IDEMPOTENCY_KEY_LENGTH } from './handoff-precheck-presentation.constants';

@Injectable()
export class RequiredIdempotencyKeyPipe implements PipeTransform<
  unknown,
  string
> {
  transform(value: unknown): string {
    if (
      !isString(value) ||
      !length(value, 1, MAX_IDEMPOTENCY_KEY_LENGTH) ||
      value.trim().length === 0
    ) {
      throw new BadRequestException(
        `X-Idempotency-Key는 1자 이상 ${MAX_IDEMPOTENCY_KEY_LENGTH}자 이하의 문자열이어야 합니다.`,
      );
    }

    return value;
  }
}

const REQUIRED_IDEMPOTENCY_KEY_PIPE = new RequiredIdempotencyKeyPipe();

export function requireIdempotencyKey(value: unknown): string {
  return REQUIRED_IDEMPOTENCY_KEY_PIPE.transform(value);
}
