import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { RoundingAnalysisService } from '../application/rounding-analysis.service';
import {
  ConfirmRoundingAnalysisRequestDto,
  ListRoundingEvidenceQueryDto,
  RoundingAnalysisConfirmationDto,
  RoundingAnalysisConfirmationResponseDto,
  RoundingAnalysisJobDto,
  RoundingAnalysisJobResponseDto,
  RoundingEvidenceDto,
  RoundingEvidenceListResponseDto,
  StartRoundingAnalysisJobRequestDto,
  toRoundingAnalysisConfirmationDto,
  toRoundingAnalysisJobDto,
  toRoundingEvidenceDto,
} from './rounding-analysis.dto';

const UUID_V4_PIPE = new ParseUUIDPipe({ version: '4' });

@ApiTags('Rounding Analysis')
@Controller()
export class RoundingAnalysisController {
  constructor(private readonly service: RoundingAnalysisService) {}

  @Post('rounding-sessions/:sessionId/analysis-jobs')
  @ApiOperation({
    summary: '전체 라운딩 종료 후 STT·화자분리·환자 후보 분석 시작',
  })
  @ApiCreatedResponse({ type: RoundingAnalysisJobResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  async startAnalysis(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('sessionId', UUID_V4_PIPE) sessionId: string,
    @Body() body: StartRoundingAnalysisJobRequestDto,
  ): Promise<RoundingAnalysisJobDto> {
    return toRoundingAnalysisJobDto(
      await this.service.start({
        context,
        sessionId,
        ...(body.audioFileId === undefined
          ? {}
          : { audioFileId: body.audioFileId }),
      }),
    );
  }

  @Get('rounding-analysis-jobs/:jobId')
  @ApiOperation({
    summary: '라운딩 분석 결과 조회',
    description:
      '인식 결과 확인 화면에서 전체 스크립트, 발화, 화자 후보를 조회한다.',
  })
  @ApiOkResponse({ type: RoundingAnalysisJobResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async readAnalysis(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('jobId', UUID_V4_PIPE) jobId: string,
  ): Promise<RoundingAnalysisJobDto> {
    return toRoundingAnalysisJobDto(
      await this.service.read({ context, jobId }),
    );
  }

  @Post('rounding-sessions/:sessionId/analysis-confirmation')
  @ApiOperation({
    summary: '간호사 확인 완료 후 transcript·Evidence·Timeline 확정 저장',
  })
  @ApiCreatedResponse({ type: RoundingAnalysisConfirmationResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  async confirmAnalysis(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('sessionId', UUID_V4_PIPE) sessionId: string,
    @Body() body: ConfirmRoundingAnalysisRequestDto,
  ): Promise<RoundingAnalysisConfirmationDto> {
    return toRoundingAnalysisConfirmationDto(
      await this.service.confirm({
        context,
        sessionId,
        jobId: body.jobId,
        utterances: body.utterances,
      }),
    );
  }

  @Get('evidence')
  @ApiOperation({
    summary: '인수인계·Timeline 근거 Evidence 검색',
    description:
      '확정 저장된 라운딩 발화 근거를 patientId, topic, query 기준으로 조회한다.',
  })
  @ApiOkResponse({ type: RoundingEvidenceListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  async listEvidence(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Query() query: ListRoundingEvidenceQueryDto,
  ): Promise<RoundingEvidenceDto[]> {
    return (
      await this.service.searchEvidence({
        context,
        ...(query.patientId === undefined
          ? {}
          : { patientId: query.patientId }),
        ...(query.topic === undefined ? {} : { topic: query.topic }),
        ...(query.query === undefined ? {} : { query: query.query }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      })
    ).map(toRoundingEvidenceDto);
  }
}
