import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';

export type PrismaPgConnection = {
  connectionString: string;
  schema?: string;
};

export type PrismaPgAdapterConfig = {
  poolConfig: PoolConfig;
  adapterOptions?: { schema: string };
};

export function parsePrismaPgConnection(
  databaseUrl: string,
): PrismaPgConnection {
  const parsedUrl = new URL(databaseUrl);
  const schema = parsedUrl.searchParams.get('schema') ?? undefined;

  if (schema !== undefined) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
      throw new Error('DATABASE_URL schema 이름이 올바르지 않습니다.');
    }

    parsedUrl.searchParams.delete('schema');
  }

  return {
    connectionString: parsedUrl.toString(),
    ...(schema === undefined ? {} : { schema }),
  };
}

export function createPrismaPgAdapterConfig(
  databaseUrl: string,
): PrismaPgAdapterConfig {
  const { connectionString, schema } = parsePrismaPgConnection(databaseUrl);

  return {
    poolConfig: {
      connectionString,
      ...(schema === undefined ? {} : { options: `-c search_path=${schema}` }),
    },
    ...(schema === undefined ? {} : { adapterOptions: { schema } }),
  };
}

export function createPrismaPgAdapter(databaseUrl: string): PrismaPg {
  const { poolConfig, adapterOptions } =
    createPrismaPgAdapterConfig(databaseUrl);

  return new PrismaPg(poolConfig, adapterOptions);
}
