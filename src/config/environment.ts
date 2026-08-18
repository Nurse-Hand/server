import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

const LOCAL_DATABASE_URL =
  'postgresql://nurse_hand:nurse_hand@localhost:5432/nurse_hand';
const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

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

  return environment;
}
