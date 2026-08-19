import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import {
  ensureRequestId,
  type RequestWithContext,
} from '../../../common/http/request-context';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { HandoffFinalizationService } from '../application/handoff-finalization.service';
import { MAX_IDEMPOTENCY_KEY_LENGTH } from './handoff-draft-presentation.constants';
import {
  FinalizedHandoffDataDto,
  FinalizedHandoffResponseDto,
  FinalizeHandoffRequestDto,
  HandoffFinalizationIdParamsDto,
} from './handoff-finalization.dto';
import { toFinalizedHandoffData } from './handoff-finalization-response.mapper';
import { requireIdempotencyKey } from './required-idempotency-key.pipe';

@ApiTags('Handoffs')
@Controller('handoffs')
export class HandoffFinalizationController {
  constructor(private readonly service: HandoffFinalizationService) {}

  @Post(':handoffId/finalize')
  @ApiOperation({ summary: '인수인계 초안을 불변 snapshot으로 최종 확정' })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    schema: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_IDEMPOTENCY_KEY_LENGTH,
    },
  })
  @ApiCreatedResponse({ type: FinalizedHandoffResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async finalize(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: HandoffFinalizationIdParamsDto,
    @Body() body: FinalizeHandoffRequestDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithContext,
  ): Promise<FinalizedHandoffDataDto> {
    return toFinalizedHandoffData(
      await this.service.finalize(
        context,
        params.handoffId,
        body,
        requireIdempotencyKey(idempotencyKey),
        ensureRequestId(request),
      ),
    );
  }
}
