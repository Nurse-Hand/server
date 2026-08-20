import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { PatientQueryService } from '../application/patient-query.service';
import {
  ListPatientTimelineQueryDto,
  PatientDataDto,
  PatientListDataDto,
  PatientListResponseDto,
  PatientResponseDto,
  PatientTimelineDataDto,
  PatientTimelineResponseDto,
  toPatientDataDto,
  toPatientListDataDto,
  toPatientTimelineDataDto,
} from './patient.dto';

const UUID_V4_PIPE = new ParseUUIDPipe({ version: '4' });

@ApiTags('Patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientQueryService: PatientQueryService) {}

  @Get()
  @ApiOperation({ summary: '담당 환자 목록 조회' })
  @ApiOkResponse({ type: PatientListResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async list(
    @DemoSessionContextParam() context: DemoSessionContext,
  ): Promise<PatientListDataDto> {
    return toPatientListDataDto(await this.patientQueryService.list(context));
  }

  @Get(':patientId')
  @ApiOperation({ summary: '환자 상세 기본정보 조회' })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async get(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('patientId', UUID_V4_PIPE) patientId: string,
  ): Promise<PatientDataDto> {
    return toPatientDataDto(
      await this.patientQueryService.get({ context, patientId }),
    );
  }

  @Get(':patientId/timeline')
  @ApiOperation({ summary: '환자별 Timeline 조회' })
  @ApiOkResponse({ type: PatientTimelineResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async timeline(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('patientId', UUID_V4_PIPE) patientId: string,
    @Query() query: ListPatientTimelineQueryDto,
  ): Promise<PatientTimelineDataDto> {
    return toPatientTimelineDataDto(
      await this.patientQueryService.readTimeline({
        context,
        patientId,
        ...(query.workDate === undefined ? {} : { workDate: query.workDate }),
        ...(query.from === undefined ? {} : { from: new Date(query.from) }),
        ...(query.to === undefined ? {} : { to: new Date(query.to) }),
      }),
    );
  }
}
