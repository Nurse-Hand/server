import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ApplicationError } from '../errors/application.error';
import { mapExceptionToPublicError } from './public-error.mapper';

describe('mapExceptionToPublicError', () => {
  it('application 오류의 안정적인 code와 공개 정보를 보존한다', () => {
    const error = new ApplicationError({
      code: 'TASK_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '업무를 찾을 수 없습니다.',
      publicDetails: { taskId: '00000000-0000-4000-8000-000000000001' },
    });

    expect(mapExceptionToPublicError(error)).toEqual({
      status: 404,
      code: 'TASK_NOT_FOUND',
      message: '업무를 찾을 수 없습니다.',
      details: { taskId: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('validation 메시지를 구조화된 details로 변환한다', () => {
    const error = new BadRequestException(['title should not be empty']);

    expect(mapExceptionToPublicError(error)).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: '요청 값이 올바르지 않습니다.',
      details: { messages: ['title should not be empty'] },
    });
  });

  it('예상하지 못한 오류의 내부 메시지를 공개하지 않는다', () => {
    const error = new Error('internal-sensitive-value');

    expect(mapExceptionToPublicError(error)).toEqual({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다.',
    });
  });

  it('multipart 용량 초과를 공개 413 오류로 보존한다', () => {
    expect(mapExceptionToPublicError(new PayloadTooLargeException())).toEqual({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: '업로드 파일 크기가 허용 범위를 초과했습니다.',
    });
  });

  it('안정적인 내부 invariant 오류를 500으로 변환한다', () => {
    const error = new ApplicationError({
      code: 'AI_JOB_INVARIANT_VIOLATION',
      kind: 'INTERNAL_ERROR',
      publicMessage: 'AI 작업 상태를 안전하게 변경할 수 없습니다.',
    });

    expect(mapExceptionToPublicError(error)).toEqual({
      status: 500,
      code: 'AI_JOB_INVARIANT_VIOLATION',
      message: 'AI 작업 상태를 안전하게 변경할 수 없습니다.',
    });
  });
});
