import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
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
import type { RequestWithContext } from '../../../common/http/request-context';
import { ensureRequestId } from '../../../common/http/request-context';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { HandoffPrechecksService } from '../application/handoff-prechecks.service';
import {
  AnsweredHandoffPrecheckItemDataDto,
  AnsweredHandoffPrecheckItemResponseDto,
  AnswerHandoffPrecheckItemRequestDto,
  CreatedHandoffPrecheckDataDto,
  CreatedHandoffPrecheckResponseDto,
  CreateHandoffPrecheckRequestDto,
  HandoffPrecheckDataDto,
  HandoffPrecheckResponseDto,
  PrecheckIdParamsDto,
  PrecheckItemIdParamsDto,
} from './handoff-precheck.dto';
import { MAX_IDEMPOTENCY_KEY_LENGTH } from './handoff-precheck-presentation.constants';
import {
  toAnsweredPrecheckItemData,
  toHandoffPrecheckData,
} from './handoff-precheck-response.mapper';
import { requireIdempotencyKey } from './required-idempotency-key.pipe';

const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';

@ApiTags('Handoff Prechecks')
@Controller('handoff-prechecks')
export class HandoffPrechecksController {
  constructor(private readonly prechecksService: HandoffPrechecksService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '인수인계 사전검증 작업 접수' })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER,
    required: true,
    schema: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_IDEMPOTENCY_KEY_LENGTH,
    },
  })
  @ApiAcceptedResponse({ type: CreatedHandoffPrecheckResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  createPrecheck(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Body() body: CreateHandoffPrecheckRequestDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithContext,
  ): Promise<CreatedHandoffPrecheckDataDto> {
    return this.prechecksService.create(
      context,
      body,
      requireIdempotencyKey(idempotencyKey),
      ensureRequestId(request),
    );
  }

  @Get(':precheckId')
  @ApiOperation({ summary: '인수인계 사전검증 결과 조회' })
  @ApiOkResponse({ type: HandoffPrecheckResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async getPrecheck(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: PrecheckIdParamsDto,
  ): Promise<HandoffPrecheckDataDto> {
    const detail = await this.prechecksService.get(context, params.precheckId);

    return toHandoffPrecheckData(detail);
  }

  @Patch(':precheckId/items/:itemId')
  @ApiOperation({ summary: '인수인계 역질문 답변 저장' })
  @ApiOkResponse({ type: AnsweredHandoffPrecheckItemResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async answerPrecheckItem(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: PrecheckItemIdParamsDto,
    @Body() body: AnswerHandoffPrecheckItemRequestDto,
  ): Promise<AnsweredHandoffPrecheckItemDataDto> {
    const answered = await this.prechecksService.answerItem(
      context,
      params.precheckId,
      params.itemId,
      body,
    );

    return toAnsweredPrecheckItemData(answered);
  }
}
