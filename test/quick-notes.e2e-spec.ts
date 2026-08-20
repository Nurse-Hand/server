import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { configureApplication } from '../src/bootstrap/configure-application';
import { RequestIdMiddleware } from '../src/common/http/request-id.middleware';
import type { DemoSessionContext } from '../src/modules/demo/application/demo-session-context';
import type { RequestWithDemoSessionContext } from '../src/modules/demo/presentation/demo-session.guard';
import { QuickNoteService } from '../src/modules/quick-notes/application/quick-note.service';
import { QuickNotesController } from '../src/modules/quick-notes/presentation/quick-notes.controller';

const DEMO_SESSION_ID = 'synthetic-quick-note-session';
const REQUEST_ID = '10000000-0000-4000-8000-000000000601';
const DEMO_CONTEXT: DemoSessionContext = {
  datasetId: '10000000-0000-4000-8000-000000000101',
  actorId: '10000000-0000-4000-8000-000000000201',
  wardId: '10000000-0000-4000-8000-000000000301',
};

class FixedDemoSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const httpRequest = context
      .switchToHttp()
      .getRequest<RequestWithDemoSessionContext>();
    const header = httpRequest.headers['x-demo-session-id'];
    const sessionId = Array.isArray(header) ? header[0] : header;

    if (sessionId !== DEMO_SESSION_ID) {
      throw new UnauthorizedException();
    }

    httpRequest.demoSessionContext = DEMO_CONTEXT;
    return true;
  }
}

describe('QuickNotes public API (isolated e2e)', () => {
  let app: INestApplication;
  let quickNoteService: jest.Mocked<Pick<QuickNoteService, 'create'>>;

  beforeAll(async () => {
    quickNoteService = {
      create: jest.fn(),
    };
    const moduleFixture = await Test.createTestingModule({
      controllers: [QuickNotesController],
      providers: [{ provide: QuickNoteService, useValue: quickNoteService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(
      (incomingRequest: Request, response: Response, next: NextFunction) =>
        requestIdMiddleware.use(incomingRequest, response, next),
    );
    app.useGlobalGuards(new FixedDemoSessionGuard());
    configureApplication(app);
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    quickNoteService.create.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000701',
      patientId: '10000000-0000-4000-8000-000000000401',
      noteType: 'OBSERVATION',
      topic: 'OBSERVATION',
      handoffSection: '관찰사항·특이사항',
      sourceType: 'QUICK_NOTE',
      text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
      occurredAt: new Date('2026-08-20T01:14:00.000Z'),
      keywords: ['관찰', '보호자'],
      structuredFacts: {
        summary: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
        text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
        occurredAt: '2026-08-20T01:14:00.000Z',
        sourceChannels: ['TEXT', 'AUDIO', 'PHOTO'],
        audioFileId: '10000000-0000-4000-8000-000000000501',
        photoFileIds: ['10000000-0000-4000-8000-000000000601'],
      },
      evidenceStatus: 'PENDING',
      audioFile: {
        id: '10000000-0000-4000-8000-000000000501',
        kind: 'AUDIO',
        mimeType: 'audio/mp4',
        originalName: 'note.m4a',
        sizeBytes: 128,
        checksum: 'a'.repeat(64),
        createdAt: new Date('2026-08-20T01:14:00.000Z'),
      },
      photoFiles: [
        {
          id: '10000000-0000-4000-8000-000000000601',
          kind: 'PHOTO',
          mimeType: 'image/jpeg',
          originalName: 'photo.jpg',
          sizeBytes: 256,
          checksum: 'b'.repeat(64),
          createdAt: new Date('2026-08-20T01:14:01.000Z'),
        },
      ],
      createdAt: new Date('2026-08-20T01:14:05.000Z'),
      updatedAt: new Date('2026-08-20T01:14:05.000Z'),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /quick-notes가 demo context와 입력 body를 전달하고 공통 envelope를 반환한다', async () => {
    const body = {
      patientId: '10000000-0000-4000-8000-000000000401',
      noteType: 'OBSERVATION',
      text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
      audioFileId: '10000000-0000-4000-8000-000000000501',
      photoFileIds: ['10000000-0000-4000-8000-000000000601'],
      occurredAt: '2026-08-20T10:14:00+09:00',
    };
    const response = await request(app.getHttpServer())
      .post('/api/v1/quick-notes')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send(body)
      .expect(201);

    expect(quickNoteService.create).toHaveBeenCalledWith(DEMO_CONTEXT, body);
    expect(response.body).toEqual({
      data: {
        quickNoteId: '10000000-0000-4000-8000-000000000701',
        patientId: '10000000-0000-4000-8000-000000000401',
        noteType: 'OBSERVATION',
        topic: 'OBSERVATION',
        handoffSection: '관찰사항·특이사항',
        sourceType: 'QUICK_NOTE',
        text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
        occurredAt: '2026-08-20T01:14:00.000Z',
        audioFile: {
          id: '10000000-0000-4000-8000-000000000501',
          kind: 'AUDIO',
          mimeType: 'audio/mp4',
          originalName: 'note.m4a',
          sizeBytes: 128,
          checksum: 'a'.repeat(64),
          createdAt: '2026-08-20T01:14:00.000Z',
        },
        photoFiles: [
          {
            id: '10000000-0000-4000-8000-000000000601',
            kind: 'PHOTO',
            mimeType: 'image/jpeg',
            originalName: 'photo.jpg',
            sizeBytes: 256,
            checksum: 'b'.repeat(64),
            createdAt: '2026-08-20T01:14:01.000Z',
          },
        ],
        keywords: ['관찰', '보호자'],
        evidenceStatus: 'PENDING',
        structuredFacts: {
          summary: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
          text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
          occurredAt: '2026-08-20T01:14:00.000Z',
          sourceChannels: ['TEXT', 'AUDIO', 'PHOTO'],
          audioFileId: '10000000-0000-4000-8000-000000000501',
          photoFileIds: ['10000000-0000-4000-8000-000000000601'],
        },
        createdAt: '2026-08-20T01:14:05.000Z',
        updatedAt: '2026-08-20T01:14:05.000Z',
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('patientId 없이 저장을 거부한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/quick-notes')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({
        noteType: 'OBSERVATION',
        text: '메모',
        occurredAt: '2026-08-20T10:14:00+09:00',
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(quickNoteService.create).not.toHaveBeenCalled();
  });

  it('photoFileIds 중복과 timezone 없는 occurredAt을 거부한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/quick-notes')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .send({
        patientId: '10000000-0000-4000-8000-000000000401',
        noteType: 'OBSERVATION',
        photoFileIds: [
          '10000000-0000-4000-8000-000000000601',
          '10000000-0000-4000-8000-000000000601',
        ],
        occurredAt: '2026-08-20T10:14:00',
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(quickNoteService.create).not.toHaveBeenCalled();
  });
});
