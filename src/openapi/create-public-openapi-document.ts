import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  APPLICATION_NAME,
  APPLICATION_VERSION,
} from '../config/application.constants';

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
] as const;

const REQUEST_ID_RESPONSE_HEADER = {
  description: '요청 추적 ID',
  schema: { type: 'string', format: 'uuid' },
};

export function createPublicOpenApiDocument(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle(APPLICATION_NAME)
    .setDescription('Nurse Hand 모바일 앱을 위한 공개 Node.js API')
    .setVersion(APPLICATION_VERSION)
    .addGlobalParameters({
      description:
        '선택적 요청 추적 UUID. 없거나 유효하지 않으면 서버가 생성합니다.',
      in: 'header',
      name: 'X-Request-Id',
      required: false,
      schema: { type: 'string', format: 'uuid' },
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`,
  });

  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem?.[method];

      if (!operation) {
        continue;
      }

      for (const response of Object.values(operation.responses)) {
        if (!response || '$ref' in response) {
          continue;
        }

        response.headers = {
          ...response.headers,
          'X-Request-Id': REQUEST_ID_RESPONSE_HEADER,
        };
      }
    }
  }

  return document;
}
