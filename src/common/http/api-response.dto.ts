import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiMetaDto {
  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}

export class ApiErrorDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiProperty({ example: '요청 값이 올바르지 않습니다.' })
  message!: string;

  @ApiPropertyOptional({
    description: '클라이언트가 수정 가능한 구조화 오류 정보',
    type: Object,
  })
  details?: unknown;
}

export class ApiErrorResponseDto {
  @ApiProperty({ type: ApiErrorDto })
  error!: ApiErrorDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
