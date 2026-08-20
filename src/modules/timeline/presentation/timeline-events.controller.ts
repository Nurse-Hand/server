import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { TimelineEventService } from '../application/timeline-event.service';
import {
  TimelineEventDataDto,
  TimelineEventHistoryDataDto,
  TimelineEventHistoryResponseDto,
  TimelineEventIdParamsDto,
  TimelineEventResponseDto,
  UpdateTimelineEventRequestDto,
} from './timeline-event.dto';
import {
  toTimelineEventDataDto,
  toTimelineEventHistoryDataDto,
} from './timeline-event-response.mapper';

const UUID_V4_PIPE = new ParseUUIDPipe({ version: '4' });

@ApiTags('Timeline')
@Controller('timeline-events')
export class TimelineEventsController {
  constructor(private readonly service: TimelineEventService) {}

  @Patch(':eventId')
  @ApiOperation({ summary: 'Timeline 이벤트 수정' })
  @ApiOkResponse({ type: TimelineEventResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async update(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('eventId', UUID_V4_PIPE) eventId: string,
    @Body() body: UpdateTimelineEventRequestDto,
  ): Promise<TimelineEventDataDto> {
    return toTimelineEventDataDto(
      await this.service.update(context, eventId, body),
    );
  }

  @Get(':eventId/history')
  @ApiOperation({ summary: 'Timeline 이벤트 변경 이력 조회' })
  @ApiOkResponse({ type: TimelineEventHistoryResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async history(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param() params: TimelineEventIdParamsDto,
  ): Promise<TimelineEventHistoryDataDto> {
    return toTimelineEventHistoryDataDto(
      await this.service.history(context, params.eventId),
    );
  }
}
