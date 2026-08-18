import { ApiProperty } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';

export class HealthDataDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: '2026-08-18T00:00:00.000Z', format: 'date-time' })
  timestamp!: string;
}

export class HealthResponseDto {
  @ApiProperty({ type: HealthDataDto })
  data!: HealthDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
