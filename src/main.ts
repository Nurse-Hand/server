import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap/configure-application';
import { SWAGGER_PATH } from './config/application.constants';
import { createPublicOpenApiDocument } from './openapi/create-public-openapi-document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  app.enableShutdownHooks();

  const openApiDocument = createPublicOpenApiDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, openApiDocument, {
    jsonDocumentUrl: `${SWAGGER_PATH}/openapi.json`,
  });

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
