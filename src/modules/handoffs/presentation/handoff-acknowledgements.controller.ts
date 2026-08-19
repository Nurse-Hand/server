import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import {
  ensureRequestId,
  type RequestWithContext,
} from '../../../common/http/request-context';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { HandoffActivityService } from '../application/handoff-activity.service';
import {
  CreateHandoffAcknowledgementRequestDto,
  HandoffAcknowledgementDataDto,
  HandoffAcknowledgementResponseDto,
  HandoffActivityIdParamsDto,
  HandoffHistoryQueryDto,
  HandoffHistoryResponseDto,
} from './handoff-activity.dto';
import {
  toHandoffAcknowledgementData,
  toHandoffHistoryEvents,
} from './handoff-activity-response.mapper';
import { MAX_IDEMPOTENCY_KEY_LENGTH } from './handoff-draft-presentation.constants';
import { requireIdempotencyKey } from './required-idempotency-key.pipe';

@ApiTags('Handoffs')
@Controller('handoffs')
export class HandoffAcknowledgementsController {
  constructor(private readonly service: HandoffActivityService) {}

  @Post(':handoffId/acknowledgements')
  @ApiOperation({ summary: '수신 간호사의 질문 또는 수신 확인 기록' })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    schema: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_IDEMPOTENCY_KEY_LENGTH,
    },
  })
  @ApiCreatedResponse({ type: HandoffAcknowledgementResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async acknowledge(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: HandoffActivityIdParamsDto,
    @Body() body: CreateHandoffAcknowledgementRequestDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithContext,
  ): Promise<HandoffAcknowledgementDataDto> {
    return toHandoffAcknowledgementData(
      await this.service.acknowledge(
        context,
        params.handoffId,
        body,
        requireIdempotencyKey(idempotencyKey),
        ensureRequestId(request),
      ),
    );
  }

  @Get(':handoffId/history')
  @ApiOperation({ summary: '인수인계 변경 및 수신 이력 조회' })
  @ApiOkResponse({ type: HandoffHistoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async history(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: HandoffActivityIdParamsDto,
    @Query() query: HandoffHistoryQueryDto,
    @Req() request: RequestWithContext,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.service.history(context, params.handoffId, query);
    const requestId = ensureRequestId(request);
    response.setHeader('X-Request-Id', requestId);
    response.status(HttpStatus.OK).json({
      data: { items: toHandoffHistoryEvents(result.items) },
      meta: { requestId, page: { nextCursor: result.nextCursor } },
    });
  }
}
