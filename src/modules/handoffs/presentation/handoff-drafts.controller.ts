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
  Query,
  Req,
  Res,
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
import type { Response } from 'express';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import {
  ensureRequestId,
  type RequestWithContext,
} from '../../../common/http/request-context';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { HandoffDraftsService } from '../application/handoff-drafts.service';
import {
  CreatedHandoffDraftDataDto,
  CreatedHandoffDraftResponseDto,
  CreateHandoffDraftRequestDto,
  HandoffDraftDetailDataDto,
  HandoffDraftDetailResponseDto,
  HandoffDraftIdParamsDto,
  HandoffDraftListResponseDto,
  ListHandoffDraftsQueryDto,
  UpdatedHandoffDraftDataDto,
  UpdatedHandoffDraftResponseDto,
  UpdateHandoffDraftRequestDto,
} from './handoff-draft.dto';
import { MAX_IDEMPOTENCY_KEY_LENGTH } from './handoff-draft-presentation.constants';
import {
  toHandoffDraftDetailData,
  toHandoffDraftListItems,
  toUpdatedHandoffDraftData,
} from './handoff-draft-response.mapper';
import { requireIdempotencyKey } from './required-idempotency-key.pipe';

@ApiTags('Handoffs')
@Controller('handoffs')
export class HandoffDraftsController {
  constructor(private readonly service: HandoffDraftsService) {}

  @Get()
  @ApiOperation({ summary: '인수인계 목록 조회' })
  @ApiOkResponse({ type: HandoffDraftListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async list(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Query() query: ListHandoffDraftsQueryDto,
    @Req() request: RequestWithContext,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.service.list(context, query);
    const requestId = ensureRequestId(request);
    response.setHeader('X-Request-Id', requestId);
    response.status(HttpStatus.OK).json({
      data: { items: toHandoffDraftListItems(result) },
      meta: { requestId, page: { nextCursor: result.nextCursor } },
    });
  }

  @Get(':handoffId')
  @ApiOperation({ summary: '인수인계 생성 상태와 초안 상세 조회' })
  @ApiOkResponse({ type: HandoffDraftDetailResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async get(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: HandoffDraftIdParamsDto,
  ): Promise<HandoffDraftDetailDataDto> {
    return toHandoffDraftDetailData(
      await this.service.get(context, params.handoffId),
    );
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '인수인계 7개 임상 섹션 초안 생성 작업 접수' })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    schema: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_IDEMPOTENCY_KEY_LENGTH,
    },
  })
  @ApiAcceptedResponse({ type: CreatedHandoffDraftResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  create(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Body() body: CreateHandoffDraftRequestDto,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithContext,
  ): Promise<CreatedHandoffDraftDataDto> {
    return this.service.create(
      context,
      body,
      requireIdempotencyKey(idempotencyKey),
      ensureRequestId(request),
    );
  }

  @Patch(':handoffId')
  @ApiOperation({ summary: 'DRAFT 인수인계 임상 섹션과 연결 업무 수정' })
  @ApiOkResponse({ type: UpdatedHandoffDraftResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async update(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: HandoffDraftIdParamsDto,
    @Body() body: UpdateHandoffDraftRequestDto,
  ): Promise<UpdatedHandoffDraftDataDto> {
    return toUpdatedHandoffDraftData(
      await this.service.update(context, params.handoffId, body),
    );
  }
}
