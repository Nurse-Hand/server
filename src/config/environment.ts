import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Max,
  Min,
  validateSync,
} from 'class-validator';

const LOCAL_DATABASE_URL =
  'postgresql://nurse_hand:nurse_hand@localhost:5432/nurse_hand';
const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export const MAX_DEMO_SESSION_TTL_SECONDS = 7 * 60 * 60;
export const DEFAULT_NO_LOGIN_MVP_DATASET_ID =
  '00000000-0000-4000-8000-000000000101';

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export class EnvironmentVariables {
  @IsIn(NODE_ENVIRONMENTS)
  NODE_ENV!: NodeEnvironment;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT!: number;

  @IsString()
  @Matches(/^postgres(?:ql)?:\/\//)
  DATABASE_URL!: string;

  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  DEMO_MODE!: boolean;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(MAX_DEMO_SESSION_TTL_SECONDS)
  DEMO_SESSION_TTL_SECONDS!: number;

  @IsString()
  @Matches(/^\//)
  FILE_STORAGE_ROOT!: string;

  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  NO_LOGIN_MVP_CONTEXT!: boolean;

  @IsOptional()
  @IsUUID()
  NO_LOGIN_MVP_DATASET_ID?: string;

  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  AI_BASE_URL?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(4_096)
  AI_INTERNAL_API_TOKEN?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(120_000)
  AI_PRIORITY_TIMEOUT_MS?: number;
}

export function validateEnvironment(
  rawEnvironment: Record<string, unknown>,
): EnvironmentVariables {
  const nodeEnvironment =
    typeof rawEnvironment.NODE_ENV === 'string'
      ? rawEnvironment.NODE_ENV
      : 'development';

  const environment = plainToInstance(
    EnvironmentVariables,
    {
      NODE_ENV: nodeEnvironment,
      PORT: rawEnvironment.PORT ?? 3000,
      DATABASE_URL:
        rawEnvironment.DATABASE_URL ??
        (nodeEnvironment === 'production' ? undefined : LOCAL_DATABASE_URL),
      DEMO_MODE: rawEnvironment.DEMO_MODE ?? false,
      DEMO_SESSION_TTL_SECONDS:
        rawEnvironment.DEMO_SESSION_TTL_SECONDS ?? MAX_DEMO_SESSION_TTL_SECONDS,
      FILE_STORAGE_ROOT: rawEnvironment.FILE_STORAGE_ROOT ?? '/data/uploads',
      NO_LOGIN_MVP_CONTEXT: rawEnvironment.NO_LOGIN_MVP_CONTEXT ?? false,
      NO_LOGIN_MVP_DATASET_ID:
        rawEnvironment.NO_LOGIN_MVP_DATASET_ID ??
        DEFAULT_NO_LOGIN_MVP_DATASET_ID,
      ...(rawEnvironment.AI_BASE_URL === undefined
        ? {}
        : { AI_BASE_URL: rawEnvironment.AI_BASE_URL }),
      ...(rawEnvironment.AI_INTERNAL_API_TOKEN === undefined
        ? {}
        : { AI_INTERNAL_API_TOKEN: rawEnvironment.AI_INTERNAL_API_TOKEN }),
      ...(rawEnvironment.AI_PRIORITY_TIMEOUT_MS === undefined
        ? {}
        : {
            AI_PRIORITY_TIMEOUT_MS: rawEnvironment.AI_PRIORITY_TIMEOUT_MS,
          }),
    },
    { enableImplicitConversion: false },
  );

  const validationErrors = validateSync(environment, {
    forbidUnknownValues: true,
    skipMissingProperties: false,
  });

  if (validationErrors.length > 0) {
    const invalidFields = validationErrors
      .map(({ property }) => property)
      .sort()
      .join(', ');

    throw new Error(`환경변수 검증 실패: ${invalidFields}`);
  }

  if (environment.NODE_ENV === 'production' && environment.DEMO_MODE) {
    throw new Error('환경변수 검증 실패: DEMO_MODE');
  }

  return environment;
}

function parseBoolean(value: unknown): unknown {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}
