import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiGoneResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import {
  ensureRequestId,
  type RequestWithContext,
} from '../../../common/http/request-context';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import type { UploadedFilePayload } from '../../files/application/uploaded-file';
import { ScheduleOcrService } from '../application/schedule-ocr.service';
import {
  CreateScheduleOcrJobRequestDto,
  mapScheduleOcrJobDto,
  ScheduleOcrJobDataDto,
  ScheduleOcrJobResponseDto,
} from './schedule-ocr.dto';

@ApiTags('Schedules')
@Controller('schedule-ocr-jobs')
export class ScheduleOcrController {
  constructor(private readonly service: ScheduleOcrService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1_024 * 1_024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'X-Idempotency-Key', required: true })
  @ApiBody({ type: CreateScheduleOcrJobRequestDto })
  @ApiOperation({ summary: '근무표 OCR 작업 접수' })
  @ApiAcceptedResponse({ type: ScheduleOcrJobResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiPayloadTooLargeResponse({ type: ApiErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  async create(
    @DemoSessionContextParam() context: DemoSessionContext,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Body() body: CreateScheduleOcrJobRequestDto,
    @Headers('x-idempotency-key') idempotencyKey = '',
    @Req() request: RequestWithContext,
  ): Promise<ScheduleOcrJobDataDto> {
    const created = await this.service.create({
      context,
      file,
      yearMonth: body.yearMonth,
      templateId: body.templateId,
      rowIndex: body.rowIndex,
      idempotencyKey,
      requestId: ensureRequestId(request),
    });
    return {
      jobId: created.jobId,
      status: 'QUEUED',
      yearMonth: body.yearMonth,
      templateId: body.templateId,
      rowIndex: body.rowIndex,
      failure: null,
      resultExpiresAt: null,
      candidates: [],
    };
  }

  @Get(':jobId')
  @ApiOperation({ summary: '근무표 OCR 작업과 후보 조회' })
  @ApiOkResponse({ type: ScheduleOcrJobResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiGoneResponse({ type: ApiErrorResponseDto })
  async get(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<ScheduleOcrJobDataDto> {
    return mapScheduleOcrJobDto(await this.service.get(context, jobId));
  }
}
