import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import { SkipDemoSession } from '../../demo/presentation/skip-demo-session.decorator';
import { HealthService } from '../application/health.service';
import { HealthDataDto, HealthResponseDto } from './health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipDemoSession()
  @ApiOperation({ summary: '서버 liveness 확인' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async getHealth(): Promise<HealthDataDto> {
    const result = await this.healthService.getHealth();

    return {
      status: result.status,
      timestamp: result.timestamp,
    };
  }
}
