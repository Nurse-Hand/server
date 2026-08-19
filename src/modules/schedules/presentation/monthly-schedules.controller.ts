import { Body, Controller, Get, Headers, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { MonthlyScheduleService } from '../application/monthly-schedule.service';
import { MonthlyScheduleIdempotencyKeyPipe } from './monthly-schedule-idempotency-key.pipe';
import { PutMonthlyScheduleRequestDto } from './monthly-schedule-request.dto';
import {
  MonthlyScheduleResponseDto,
  type MonthlyScheduleDataDto,
  toMonthlyScheduleDataDto,
} from './monthly-schedule-response.dto';
import { YearMonthPipe } from './year-month.pipe';

const IDEMPOTENCY_HEADER = {
  description:
    '같은 actor와 endpoint에서 월별 전체 교체 replay를 식별하는 opaque key',
  name: 'X-Idempotency-Key',
  required: true,
  schema: {
    maxLength: 128,
    minLength: 1,
    pattern: '^[\\x21-\\x7E]+$',
    type: 'string',
  },
} as const;

const IDEMPOTENCY_KEY_PIPE = new MonthlyScheduleIdempotencyKeyPipe();
const YEAR_MONTH_PIPE = new YearMonthPipe();

@ApiTags('Schedules')
@Controller('me/schedules')
export class MonthlySchedulesController {
  constructor(private readonly service: MonthlyScheduleService) {}

  @Put(':yearMonth')
  @ApiOperation({ summary: '확정한 월별 근무표 전체 교체 저장' })
  @ApiParam({ name: 'yearMonth', example: '2026-08' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOkResponse({ type: MonthlyScheduleResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async put(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('yearMonth', YEAR_MONTH_PIPE) yearMonth: string,
    @Headers('x-idempotency-key') idempotencyKeyHeader: unknown,
    @Body() body: PutMonthlyScheduleRequestDto,
  ): Promise<MonthlyScheduleDataDto> {
    const idempotencyKey = IDEMPOTENCY_KEY_PIPE.transform(idempotencyKeyHeader);
    const result = await this.service.put(
      context,
      yearMonth,
      idempotencyKey,
      body,
    );
    return toMonthlyScheduleDataDto(result.schedule);
  }

  @Get(':yearMonth')
  @ApiOperation({ summary: '내 월별 근무표와 근무 유형별 합계 조회' })
  @ApiParam({ name: 'yearMonth', example: '2026-08' })
  @ApiOkResponse({ type: MonthlyScheduleResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async find(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('yearMonth', YEAR_MONTH_PIPE) yearMonth: string,
  ): Promise<MonthlyScheduleDataDto> {
    return toMonthlyScheduleDataDto(
      await this.service.find(context, yearMonth),
    );
  }
}
