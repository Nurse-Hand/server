import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TaskService } from '../application/task.service';
import { TasksController } from './tasks.controller';

describe('Task OpenAPI response meta', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('단건은 requestId만, 목록은 page.nextCursor까지 공개한다', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TaskService, useValue: {} }],
    }).compile();
    app = moduleRef.createNestApplication();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components?.schemas;

    expect(schemas?.TaskResponseDto).toMatchObject({
      properties: {
        meta: { $ref: '#/components/schemas/ApiMetaDto' },
      },
    });
    expect(schemas?.TaskListResponseDto).toMatchObject({
      properties: {
        meta: { $ref: '#/components/schemas/ApiPaginatedMetaDto' },
      },
    });
    expect(schemas?.ApiMetaDto).toMatchObject({
      required: ['requestId'],
      properties: {
        requestId: { type: 'string', format: 'uuid' },
      },
    });
    expect(schemas?.ApiMetaDto).not.toMatchObject({
      properties: { page: expect.anything() },
    });
    expect(schemas?.ApiPaginatedMetaDto).toMatchObject({
      required: ['requestId', 'page'],
      properties: {
        page: { $ref: '#/components/schemas/ApiPageMetaDto' },
      },
    });
    expect(schemas?.ApiPageMetaDto).toMatchObject({
      required: ['nextCursor'],
      properties: {
        nextCursor: { type: 'string', nullable: true },
      },
    });
    expect(schemas?.ReserveTaskExtractionRequestDto).toMatchObject({
      properties: {
        recordIds: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: { type: 'string', format: 'uuid' },
        },
      },
    });
    expect(schemas?.ReserveTaskExtractionRequestDto).not.toMatchObject({
      properties: { recordIds: { items: { type: 'array' } } },
    });
  });
});
