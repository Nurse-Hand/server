import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HandoffActivityService } from '../application/handoff-activity.service';
import { HandoffAcknowledgementsController } from './handoff-acknowledgements.controller';

describe('Handoff activity OpenAPI schema', () => {
  let app: INestApplication;
  afterEach(async () => app?.close());

  it('acknowledgement와 history의 구체 schema 및 상태 코드를 공개한다', async () => {
    const fixture = await Test.createTestingModule({
      controllers: [HandoffAcknowledgementsController],
      providers: [{ provide: HandoffActivityService, useValue: {} }],
    }).compile();
    app = fixture.createNestApplication();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const post = document.paths['/handoffs/{handoffId}/acknowledgements']?.post;
    const get = document.paths['/handoffs/{handoffId}/history']?.get;
    expect(Object.keys(post?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '401',
      '403',
      '404',
      '409',
      '422',
      '500',
    ]);
    expect(Object.keys(get?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '500',
    ]);
    expect(post?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'header',
          name: 'X-Idempotency-Key',
          required: true,
        }),
      ]),
    );
    expect(
      document.components?.schemas?.CreateHandoffAcknowledgementRequestDto,
    ).toMatchObject({
      required: ['status'],
      properties: {
        status: { enum: ['QUESTIONED', 'ACKNOWLEDGED'] },
        comment: { nullable: true, maxLength: 1000 },
      },
    });
    expect(document.components?.schemas?.HandoffHistoryDataDto).toMatchObject({
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/HandoffHistoryEventDto' },
        },
      },
    });
    expect(document.components?.schemas?.HandoffHistoryMetaDto).toMatchObject({
      properties: {
        requestId: { format: 'uuid' },
        page: { $ref: '#/components/schemas/HandoffHistoryPageMetaDto' },
      },
    });
    expect(
      document.components?.schemas?.HandoffHistoryPageMetaDto,
    ).toMatchObject({
      properties: { nextCursor: { type: 'string', nullable: true } },
    });
  });
});
