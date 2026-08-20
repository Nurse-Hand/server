import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { PatientCommandService } from '../application/patient-command.service';
import { PatientQueryService } from '../application/patient-query.service';
import {
  CreatePatientRequestDto,
  DischargePatientRequestDto,
  UpdatePatientRequestDto,
} from './patient-command.dto';
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
  constructor(
    private readonly patientQueryService: PatientQueryService,
    private readonly patientCommandService: PatientCommandService,
  ) {}

  @Get()
  @ApiOperation({ summary: '담당 환자 목록 조회' })
  @ApiOkResponse({ type: PatientListResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async list(
    @DemoSessionContextParam() context: DemoSessionContext,
  ): Promise<PatientListDataDto> {
    return toPatientListDataDto(await this.patientQueryService.list(context));
  }

  @Post()
  @ApiOperation({ summary: '환자 추가' })
  @ApiCreatedResponse({ type: PatientResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async create(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Body() body: CreatePatientRequestDto,
  ): Promise<PatientDataDto> {
    return toPatientDataDto(
      await this.patientCommandService.create(context, body),
    );
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

  @Patch(':patientId')
  @ApiOperation({ summary: '환자 기본정보 수정' })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async update(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('patientId', UUID_V4_PIPE) patientId: string,
    @Body() body: UpdatePatientRequestDto,
  ): Promise<PatientDataDto> {
    return toPatientDataDto(
      await this.patientCommandService.update(context, patientId, body),
    );
  }

  @Post(':patientId/discharge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '환자 퇴원 처리' })
  @ApiOkResponse({ type: PatientResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async discharge(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('patientId', UUID_V4_PIPE) patientId: string,
    @Body() body: DischargePatientRequestDto,
  ): Promise<PatientDataDto> {
    return toPatientDataDto(
      await this.patientCommandService.discharge(context, patientId, body),
    );
  }
}
