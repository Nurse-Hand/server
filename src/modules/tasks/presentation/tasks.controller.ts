import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import {
  ensureRequestId,
  type RequestWithContext,
} from '../../../common/http/request-context';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { TaskService } from '../application/task.service';
import { TaskIdempotencyKeyPipe } from './task-idempotency-key.pipe';
import {
  ApplyTaskCandidatesRequestDto,
  CreateTaskRequestDto,
  ListTasksQueryDto,
  ReserveTaskExtractionRequestDto,
  UpdateTaskRequestDto,
} from './task-request.dto';
import {
  ApplyTaskCandidatesResponseDto,
  TaskExtractionJobResponseDto,
  TaskExtractionReservationResponseDto,
  TaskListResponseDto,
  TaskResponseDto,
  type ApplyTaskCandidatesDataDto,
  type TaskDataDto,
  type TaskExtractionJobDataDto,
  type TaskExtractionReservationDataDto,
  type TaskListDataDto,
} from './task-response.dto';
import {
  toApplyTaskCandidatesDataDto,
  toTaskDataDto,
  toTaskExtractionJobDataDto,
  toTaskExtractionReservationDataDto,
  toTaskListDataDto,
} from './task-response.mapper';

const IDEMPOTENCY_HEADER = {
  description: '같은 actor와 endpoint에서 요청 replay를 식별하는 opaque key',
  name: 'X-Idempotency-Key',
  required: true,
  schema: {
    maxLength: 128,
    minLength: 1,
    pattern: '^[\\x21-\\x7E]+$',
    type: 'string',
  },
} as const;

const UUID_V4_PIPE = new ParseUUIDPipe({ version: '4' });
const IDEMPOTENCY_KEY_PIPE = new TaskIdempotencyKeyPipe();

@ApiTags('Tasks')
@Controller()
export class TasksController {
  constructor(private readonly taskService: TaskService) {}

  @Get('tasks')
  @ApiOperation({ summary: '업무 목록 조회' })
  @ApiOkResponse({ type: TaskListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async list(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Query() query: ListTasksQueryDto,
  ): Promise<TaskListDataDto> {
    return toTaskListDataDto(await this.taskService.list(context, query));
  }

  @Post('tasks')
  @ApiOperation({ summary: '업무 직접 생성' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async create(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Headers('x-idempotency-key') idempotencyKeyHeader: unknown,
    @Req() request: RequestWithContext,
    @Body() body: CreateTaskRequestDto,
  ): Promise<TaskDataDto> {
    const idempotencyKey = IDEMPOTENCY_KEY_PIPE.transform(idempotencyKeyHeader);
    const result = await this.taskService.create(
      context,
      idempotencyKey,
      ensureRequestId(request),
      body,
    );

    return toTaskDataDto(result.task);
  }

  @Post('task-extraction-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '라운딩 근거에서 업무 후보 추출 작업 접수' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiAcceptedResponse({ type: TaskExtractionReservationResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiBadGatewayResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async reserveExtraction(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Headers('x-idempotency-key') idempotencyKeyHeader: unknown,
    @Req() request: RequestWithContext,
    @Body() body: ReserveTaskExtractionRequestDto,
  ): Promise<TaskExtractionReservationDataDto> {
    const idempotencyKey = IDEMPOTENCY_KEY_PIPE.transform(idempotencyKeyHeader);
    const reserved = await this.taskService.reserveExtraction(
      context,
      idempotencyKey,
      ensureRequestId(request),
      body,
    );

    return toTaskExtractionReservationDataDto(reserved);
  }

  @Get('task-extraction-jobs/:jobId')
  @ApiOperation({ summary: '업무 후보 추출 작업 상태와 결과 조회' })
  @ApiOkResponse({ type: TaskExtractionJobResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async findExtractionJob(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('jobId', UUID_V4_PIPE) jobId: string,
  ): Promise<TaskExtractionJobDataDto> {
    return toTaskExtractionJobDataDto(
      await this.taskService.findExtractionJob(context, jobId),
    );
  }

  @Patch('tasks/:taskId')
  @ApiOperation({ summary: '업무 내용·마감·상태·확정 우선순위 수정' })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async update(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('taskId', UUID_V4_PIPE) taskId: string,
    @Body() body: UpdateTaskRequestDto,
  ): Promise<TaskDataDto> {
    return toTaskDataDto(await this.taskService.update(context, taskId, body));
  }

  @Post('task-extraction-jobs/:jobId/apply')
  @ApiOperation({ summary: '선택한 업무 후보를 원자적으로 반영' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiCreatedResponse({ type: ApplyTaskCandidatesResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async applyCandidates(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Param('jobId', UUID_V4_PIPE) jobId: string,
    @Headers('x-idempotency-key') idempotencyKeyHeader: unknown,
    @Body() body: ApplyTaskCandidatesRequestDto,
  ): Promise<ApplyTaskCandidatesDataDto> {
    const idempotencyKey = IDEMPOTENCY_KEY_PIPE.transform(idempotencyKeyHeader);
    return toApplyTaskCandidatesDataDto(
      await this.taskService.applyCandidates(
        context,
        jobId,
        idempotencyKey,
        body,
      ),
    );
  }
}
