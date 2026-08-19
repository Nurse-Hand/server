import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { RoundingSessionService } from '../application/rounding-session.service';
import {
  AddRoundingPatientSegmentRequestDto,
  CompleteRoundingSessionRequestDto,
  mapRoundingSessionDto,
  RoundingSessionDataDto,
  RoundingSessionResponseDto,
  StartRoundingSessionRequestDto,
} from './rounding-session.dto';

@ApiTags('Rounding')
@Controller('rounding-sessions')
export class RoundingSessionsController {
  constructor(private readonly service: RoundingSessionService) {}

  @Post()
  @ApiOperation({ summary: '라운딩 세션 시작' })
  @ApiCreatedResponse({ type: RoundingSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async start(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Body() body: StartRoundingSessionRequestDto,
  ): Promise<RoundingSessionDataDto> {
    return mapRoundingSessionDto(
      await this.service.start({
        context,
        ...(body.startedAt === undefined
          ? {}
          : { startedAt: new Date(body.startedAt) }),
        ...(body.note === undefined ? {} : { note: body.note }),
      }),
    );
  }

  @Post(':sessionId/patient-segments')
  @ApiOperation({ summary: '현재 환자 라운딩 구간 저장' })
  @ApiCreatedResponse({ type: RoundingSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  async addPatientSegment(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: AddRoundingPatientSegmentRequestDto,
  ): Promise<RoundingSessionDataDto> {
    return mapRoundingSessionDto(
      await this.service.addPatientSegment({
        context,
        sessionId,
        patientId: body.patientId,
        startedAt: new Date(body.startedAt),
        endedAt: new Date(body.endedAt),
        ...(body.note === undefined ? {} : { note: body.note }),
      }),
    );
  }

  @Post(':sessionId/complete')
  @ApiOperation({ summary: '전체 라운딩 종료' })
  @ApiOkResponse({ type: RoundingSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  async complete(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: CompleteRoundingSessionRequestDto,
  ): Promise<RoundingSessionDataDto> {
    return mapRoundingSessionDto(
      await this.service.complete({
        context,
        sessionId,
        ...(body.completedAt === undefined
          ? {}
          : { completedAt: new Date(body.completedAt) }),
      }),
    );
  }

  @Get(':sessionId')
  @ApiOperation({ summary: '라운딩 세션 상세 조회' })
  @ApiOkResponse({ type: RoundingSessionResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async read(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<RoundingSessionDataDto> {
    return mapRoundingSessionDto(
      await this.service.read({ context, sessionId }),
    );
  }
}
