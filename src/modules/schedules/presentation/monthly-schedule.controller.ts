import { Body, Controller, Get, Headers, Param, Put } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiGoneResponse,
  ApiHeader,
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
import {
  mapMonthlyScheduleDto,
  type MonthlyScheduleDataDto,
  MonthlyScheduleResponseDto,
  PutMonthlyScheduleRequestDto,
} from './monthly-schedule.dto';

@ApiTags('Schedules')
@Controller('me/schedules')
export class MonthlyScheduleController {
  constructor(private readonly service: MonthlyScheduleService) {}

  @Put(':yearMonth')
  @ApiOperation({ summary: '사용자가 확인한 월별 근무표 저장' })
  @ApiParam({ name: 'yearMonth', example: '2026-08' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: true })
  @ApiOkResponse({ type: MonthlyScheduleResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiGoneResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  async put(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('yearMonth') yearMonth: string,
    @Body() body: PutMonthlyScheduleRequestDto,
    @Headers('x-idempotency-key') idempotencyKey = '',
  ): Promise<MonthlyScheduleDataDto> {
    return mapMonthlyScheduleDto(
      await this.service.put({
        context,
        yearMonth,
        sourceJobId: body.sourceJobId ?? null,
        expectedVersion: body.expectedVersion,
        entries: body.entries,
        idempotencyKey,
      }),
    );
  }

  @Get(':yearMonth')
  @ApiOperation({ summary: '내 월별 근무표와 근무 유형별 합계 조회' })
  @ApiParam({ name: 'yearMonth', example: '2026-08' })
  @ApiOkResponse({ type: MonthlyScheduleResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async get(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('yearMonth') yearMonth: string,
  ): Promise<MonthlyScheduleDataDto> {
    return mapMonthlyScheduleDto(await this.service.read(context, yearMonth));
  }
}
