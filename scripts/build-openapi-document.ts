import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';
import { createPublicOpenApiDocument } from '../src/openapi/create-public-openapi-document';

export async function buildOpenApiDocument(): Promise<OpenAPIObject> {
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
