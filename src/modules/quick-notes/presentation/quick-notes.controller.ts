import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { RequestWithContext } from '../../../common/http/request-context';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { QuickNoteService } from '../application/quick-note.service';
import { CreateQuickNoteRequestDto } from './quick-note-request.dto';
import {
  QuickNoteDataDto,
  QuickNoteResponseDto,
  toQuickNoteDataDto,
} from './quick-note-response.dto';

@ApiTags('QuickNotes')
@Controller('quick-notes')
export class QuickNotesController {
  constructor(private readonly quickNoteService: QuickNoteService) {}

  @Post()
  @ApiOperation({ summary: '환자 선택 기반 빠른 기록 저장' })
  @ApiCreatedResponse({ type: QuickNoteResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async create(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Req() _request: RequestWithContext,
    @Body() body: CreateQuickNoteRequestDto,
  ): Promise<QuickNoteDataDto> {
    return toQuickNoteDataDto(await this.quickNoteService.create(context, body));
  }
}
