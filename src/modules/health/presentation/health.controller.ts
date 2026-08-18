import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import { HealthService } from '../application/health.service';
import { HealthDataDto, HealthResponseDto } from './health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: '서버 liveness 확인' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  getHealth(): HealthDataDto {
    const result = this.healthService.getHealth();

    return {
      status: result.status,
      timestamp: result.timestamp,
    };
  }
}
