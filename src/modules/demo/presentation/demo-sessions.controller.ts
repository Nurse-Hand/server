import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import { DemoSessionService } from '../application/demo-session.service';
import {
  CreateDemoSessionRequestDto,
  DemoSessionDataDto,
  DemoSessionResponseDto,
} from './create-demo-session.dto';
import { DemoModeGuard } from './demo-mode.guard';
import { SkipDemoSession } from './skip-demo-session.decorator';

@ApiTags('Demo')
@Controller('demo-sessions')
@UseGuards(DemoModeGuard)
export class DemoSessionsController {
  constructor(private readonly demoSessionService: DemoSessionService) {}

  @Post()
  @SkipDemoSession()
  @ApiOperation({ summary: '격리된 synthetic demo session 생성' })
  @ApiCreatedResponse({ type: DemoSessionResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({
    description: 'DEMO_MODE가 비활성화된 환경',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async create(
    @Body() body: CreateDemoSessionRequestDto,
  ): Promise<DemoSessionDataDto> {
    const created = await this.demoSessionService.create(body.scenarioKey);

    return {
      scenarioKey: created.scenarioKey,
      expiresAt: created.expiresAt.toISOString(),
      sessions: created.sessions.map(({ persona, sessionId }) => ({
        persona,
        sessionId,
      })),
    };
  }
}
