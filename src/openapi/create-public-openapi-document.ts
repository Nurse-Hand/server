import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

const DEMO_SESSIONS_PATH = '/api/v1/demo-sessions';
const HEALTH_PATH = '/api/v1/health';

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
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-Demo-Session-Id',
        description:
          '인증 제외 기간에 보호 API의 dataset/actor/ward 범위를 복원하는 opaque demo session 값',
      },
      'demo-session',
    )
    .addSecurityRequirements('demo-session')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`,
  });

  if (!app.get(ConfigService).getOrThrow<boolean>('DEMO_MODE')) {
    delete document.paths[DEMO_SESSIONS_PATH];
  }

  const healthOperation = document.paths[HEALTH_PATH]?.get;
  if (healthOperation) {
    healthOperation.security = [];
  }

  const demoSessionCreate = document.paths[DEMO_SESSIONS_PATH]?.post;
  if (demoSessionCreate) {
    demoSessionCreate.security = [];
  }

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
