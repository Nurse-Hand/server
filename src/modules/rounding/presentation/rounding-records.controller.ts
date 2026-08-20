import { Controller, Get } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { RoundingRecordService } from '../application/rounding-record.service';
import {
  mapRoundingRecordListDto,
  RoundingRecordListDataDto,
  RoundingRecordListResponseDto,
} from './rounding-record.dto';

@ApiTags('Rounding')
@Controller('rounding-records')
export class RoundingRecordsController {
  constructor(private readonly service: RoundingRecordService) {}

  @Get()
  @ApiOperation({ summary: '오늘 라운딩 기록 조회' })
  @ApiOkResponse({ type: RoundingRecordListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  async list(
    @DemoSessionContextParam() context: DemoSessionContext,
  ): Promise<RoundingRecordListDataDto> {
    const list = await this.service.listToday(context);
    return mapRoundingRecordListDto(list);
  }
}
