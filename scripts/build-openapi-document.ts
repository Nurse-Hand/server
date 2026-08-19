import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { configureApplication } from '../src/bootstrap/configure-application';
import { createPublicOpenApiDocument } from '../src/openapi/create-public-openapi-document';

export async function buildOpenApiDocument(): Promise<OpenAPIObject> {
  process.env.DEMO_MODE = 'true';
  process.env.DEMO_SESSION_TTL_SECONDS ??= '25200';
  const { AppModule } = await import('../src/app.module.js');
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });

  try {
    configureApplication(app);
    await app.init();
    return createPublicOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

export function serializeOpenApiDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
