import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import {
  HANDOFF_UNVERIFIED_HANDLINGS,
  type HandoffUnverifiedHandling,
} from '../domain/handoff.constants';
import { MAX_VERSION } from './handoff-draft-presentation.constants';

export class HandoffFinalizationIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  handoffId!: string;
}

export class FinalizeHandoffRequestDto {
  @ApiProperty({ minimum: 1, maximum: MAX_VERSION })
  @IsInt()
  @Min(1)
  @Max(MAX_VERSION)
  version!: number;

  @ApiProperty({ enum: HANDOFF_UNVERIFIED_HANDLINGS })
  @IsIn(HANDOFF_UNVERIFIED_HANDLINGS)
  unverifiedHandling!: HandoffUnverifiedHandling;
}

export class FinalizedHandoffDataDto {
  @ApiProperty({ format: 'uuid' })
  handoffId!: string;

  @ApiProperty({ enum: ['FINALIZED'] })
  status!: 'FINALIZED';

  @ApiProperty({ format: 'date-time' })
  finalizedAt!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;
}

export class FinalizedHandoffResponseDto {
  @ApiProperty({ type: FinalizedHandoffDataDto })
  data!: FinalizedHandoffDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
