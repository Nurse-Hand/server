import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HandoffFinalizationService } from '../application/handoff-finalization.service';
import { HandoffFinalizationController } from './handoff-finalization.controller';

describe('Handoff finalization OpenAPI schema', () => {
  let app: INestApplication;

  afterEach(async () => app?.close());

  it('필수 header/body와 성공·오류 상태 코드를 공개한다', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HandoffFinalizationController],
      providers: [{ provide: HandoffFinalizationService, useValue: {} }],
    }).compile();
    app = moduleRef.createNestApplication();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const operation = document.paths['/handoffs/{handoffId}/finalize']?.post;

    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'header',
          name: 'X-Idempotency-Key',
          required: true,
          schema: expect.objectContaining({
            type: 'string',
            minLength: 1,
            maxLength: 128,
          }),
        }),
      ]),
    );
    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/FinalizeHandoffRequestDto',
          },
        },
      },
    });
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual([
      '201',
      '400',
      '401',
      '403',
      '404',
      '409',
      '422',
      '500',
    ]);
    expect(
      document.components?.schemas?.FinalizeHandoffRequestDto,
    ).toMatchObject({
      required: ['version', 'unverifiedHandling'],
      properties: {
        version: { type: 'number', minimum: 1, maximum: 2147483647 },
        unverifiedHandling: {
          type: 'string',
          enum: ['RESOLVED', 'KEEP_WITH_WARNING'],
        },
      },
    });
    expect(
      document.components?.schemas?.FinalizedHandoffResponseDto,
    ).toMatchObject({
      required: ['data', 'meta'],
      properties: {
        data: { $ref: '#/components/schemas/FinalizedHandoffDataDto' },
        meta: { $ref: '#/components/schemas/ApiMetaDto' },
      },
    });
  });
});
