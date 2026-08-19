import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HandoffDraftsService } from '../application/handoff-drafts.service';
import { HandoffDraftsController } from './handoff-drafts.controller';

describe('Handoff draft list OpenAPI schema', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('목록 items와 pagination meta를 concrete schema reference로 공개한다', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HandoffDraftsController],
      providers: [{ provide: HandoffDraftsService, useValue: {} }],
    }).compile();
    app = moduleRef.createNestApplication();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components?.schemas;

    expect(document.paths['/handoffs']?.get?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/HandoffDraftListResponseDto',
          },
        },
      },
    });
    expect(schemas?.HandoffDraftListResponseDto).toMatchObject({
      required: ['data', 'meta'],
      properties: {
        data: { $ref: '#/components/schemas/HandoffDraftListDataDto' },
        meta: { $ref: '#/components/schemas/HandoffDraftListMetaDto' },
      },
    });
    expect(schemas?.HandoffDraftListDataDto).toMatchObject({
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/HandoffDraftListItemDto' },
        },
      },
    });
    expect(schemas?.HandoffDraftListMetaDto).toMatchObject({
      required: ['requestId', 'page'],
      properties: {
        requestId: { type: 'string', format: 'uuid' },
        page: { $ref: '#/components/schemas/HandoffDraftListPageMetaDto' },
      },
    });
    expect(schemas?.HandoffDraftListPageMetaDto).toMatchObject({
      required: ['nextCursor'],
      properties: {
        nextCursor: { type: 'string', nullable: true },
      },
    });
  });
});
