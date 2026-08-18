import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import {
  DEMO_SCENARIO_KEYS,
  type DemoScenarioKey,
} from '../domain/demo-scenario';
import {
  DEMO_SESSION_PERSONAS,
  type DemoSessionPersona,
} from '../domain/demo-session-persona';

export class CreateDemoSessionRequestDto {
  @ApiProperty({ enum: DEMO_SCENARIO_KEYS })
  @IsIn(DEMO_SCENARIO_KEYS)
  scenarioKey!: DemoScenarioKey;
}

export class DemoSessionCredentialDto {
  @ApiProperty({ enum: DEMO_SESSION_PERSONAS })
  persona!: DemoSessionPersona;

  @ApiProperty({
    description: 'X-Demo-Session-Id header로 전달할 1회 발급 opaque session 값',
    example: 'syntheticOpaqueSessionValueNotPersistedAsPlaintext',
  })
  sessionId!: string;
}

export class DemoSessionDataDto {
  @ApiProperty({ enum: DEMO_SCENARIO_KEYS })
  scenarioKey!: DemoScenarioKey;

  @ApiProperty({ format: 'date-time', example: '2026-08-18T01:00:00.000Z' })
  expiresAt!: string;

  @ApiProperty({ type: DemoSessionCredentialDto, isArray: true })
  sessions!: DemoSessionCredentialDto[];
}

export class DemoSessionResponseDto {
  @ApiProperty({ type: DemoSessionDataDto })
  data!: DemoSessionDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}
