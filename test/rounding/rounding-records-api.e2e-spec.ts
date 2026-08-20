import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { RequestIdMiddleware } from '../../src/common/http/request-id.middleware';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import type { RequestWithDemoSessionContext } from '../../src/modules/demo/presentation/demo-session.guard';
import { RoundingRecordService } from '../../src/modules/rounding/application/rounding-record.service';
import { RoundingSessionService } from '../../src/modules/rounding/application/rounding-session.service';
import { RoundingRecordsController } from '../../src/modules/rounding/presentation/rounding-records.controller';
import { RoundingSessionsController } from '../../src/modules/rounding/presentation/rounding-sessions.controller';

const DEMO_SESSION_ID = 'synthetic-rounding-session';
const REQUEST_ID = '10000000-0000-4000-8000-000000000601';
const ROUNDING_SESSION_ID = '10000000-0000-4000-8000-000000000701';
const RECORD_ID = '10000000-0000-4000-8000-000000000702';
const CHUNK_ID = '10000000-0000-4000-8000-000000000703';
const PATIENT_ID = '10000000-0000-4000-8000-000000000704';
const AUDIO_FILE_ID = '10000000-0000-4000-8000-000000000705';
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

describe('Rounding records public API (isolated e2e)', () => {
  let app: INestApplication;
  const roundingSessionService = {
    start: jest.fn(),
    addPatientSegment: jest.fn(),
    complete: jest.fn(),
    read: jest.fn(),
  };
  const roundingRecordService = {
    create: jest.fn(),
    uploadAudioChunk: jest.fn(),
    listToday: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [RoundingSessionsController, RoundingRecordsController],
      providers: [
        { provide: RoundingSessionService, useValue: roundingSessionService },
        { provide: RoundingRecordService, useValue: roundingRecordService },
      ],
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
    roundingRecordService.create.mockResolvedValue({
      id: RECORD_ID,
      sessionId: ROUNDING_SESSION_ID,
      patientId: PATIENT_ID,
      patientDisplayName: '환자 A',
      patientRoomLabel: '301호',
      actorId: DEMO_CONTEXT.actorId,
      wardId: DEMO_CONTEXT.wardId,
      sequence: 1,
      workDate: new Date('2026-08-20T00:00:00.000Z'),
      startedAt: new Date('2026-08-20T01:00:00.000Z'),
      endedAt: new Date('2026-08-20T01:03:00.000Z'),
      note: '보행 시 통증 호소',
      audioFileId: AUDIO_FILE_ID,
      createdAt: new Date('2026-08-20T01:03:10.000Z'),
    });
    roundingRecordService.uploadAudioChunk.mockResolvedValue({
      id: CHUNK_ID,
      sessionId: ROUNDING_SESSION_ID,
      audioFileId: AUDIO_FILE_ID,
      mimeType: 'audio/mp4',
      originalName: 'rounding.m4a',
      sizeBytes: 128,
      checksum: 'a'.repeat(64),
      createdAt: new Date('2026-08-20T01:00:00.000Z'),
    });
    roundingRecordService.listToday.mockResolvedValue({
      date: new Date('2026-08-20T00:00:00.000Z'),
      items: [
        {
          id: RECORD_ID,
          sessionId: ROUNDING_SESSION_ID,
          patientId: PATIENT_ID,
          patientDisplayName: '환자 A',
          patientRoomLabel: '301호',
          actorId: DEMO_CONTEXT.actorId,
          wardId: DEMO_CONTEXT.wardId,
          sequence: 1,
          workDate: new Date('2026-08-20T00:00:00.000Z'),
          startedAt: new Date('2026-08-20T01:00:00.000Z'),
          endedAt: new Date('2026-08-20T01:03:00.000Z'),
          note: '보행 시 통증 호소',
          audioFileId: AUDIO_FILE_ID,
          createdAt: new Date('2026-08-20T01:03:10.000Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /rounding-sessions/{sessionId}/records가 공통 envelope로 라운딩 기록을 저장한다', async () => {
    const body = {
      patientId: PATIENT_ID,
      startedAt: '2026-08-20T10:00:00+09:00',
      endedAt: '2026-08-20T10:03:00+09:00',
      note: '보행 시 통증 호소',
      audioFileId: AUDIO_FILE_ID,
    };

    const response = await request(app.getHttpServer())
      .post(`/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}/records`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send(body)
      .expect(201);

    expect(roundingRecordService.create).toHaveBeenCalledWith({
      context: DEMO_CONTEXT,
      sessionId: ROUNDING_SESSION_ID,
      patientId: PATIENT_ID,
      startedAt: new Date('2026-08-20T10:00:00+09:00'),
      endedAt: new Date('2026-08-20T10:03:00+09:00'),
      note: '보행 시 통증 호소',
      audioFileId: AUDIO_FILE_ID,
    });
    expect(response.body).toEqual({
      data: {
        recordId: RECORD_ID,
        sessionId: ROUNDING_SESSION_ID,
        patientId: PATIENT_ID,
        patientDisplayName: '환자 A',
        patientRoomLabel: '301호',
        actorId: DEMO_CONTEXT.actorId,
        wardId: DEMO_CONTEXT.wardId,
        sequence: 1,
        workDate: '2026-08-20',
        startedAt: '2026-08-20T01:00:00.000Z',
        endedAt: '2026-08-20T01:03:00.000Z',
        note: '보행 시 통증 호소',
        audioFileId: AUDIO_FILE_ID,
        createdAt: '2026-08-20T01:03:10.000Z',
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('POST /rounding-sessions/{sessionId}/audio-chunks가 multipart 파일을 저장한다', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}/audio-chunks`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .attach('file', Buffer.from('fake-audio'), {
        filename: 'rounding.m4a',
        contentType: 'audio/mp4',
      })
      .expect(201);

    expect(roundingRecordService.uploadAudioChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        context: DEMO_CONTEXT,
        sessionId: ROUNDING_SESSION_ID,
        file: expect.objectContaining({
          originalname: 'rounding.m4a',
          mimetype: 'audio/mp4',
        }),
      }),
    );
    expect(response.body).toEqual({
      data: {
        chunkId: CHUNK_ID,
        sessionId: ROUNDING_SESSION_ID,
        audioFileId: AUDIO_FILE_ID,
        mimeType: 'audio/mp4',
        originalName: 'rounding.m4a',
        sizeBytes: 128,
        checksum: 'a'.repeat(64),
        createdAt: '2026-08-20T01:00:00.000Z',
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('GET /rounding-records가 오늘 라운딩 기록 목록을 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rounding-records')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .expect(200);

    expect(roundingRecordService.listToday).toHaveBeenCalledWith(DEMO_CONTEXT);
    expect(response.body).toEqual({
      data: {
        date: '2026-08-20',
        items: [
          {
            recordId: RECORD_ID,
            sessionId: ROUNDING_SESSION_ID,
            patientId: PATIENT_ID,
            patientDisplayName: '환자 A',
            patientRoomLabel: '301호',
            actorId: DEMO_CONTEXT.actorId,
            wardId: DEMO_CONTEXT.wardId,
            sequence: 1,
            workDate: '2026-08-20',
            startedAt: '2026-08-20T01:00:00.000Z',
            endedAt: '2026-08-20T01:03:00.000Z',
            note: '보행 시 통증 호소',
            audioFileId: AUDIO_FILE_ID,
            createdAt: '2026-08-20T01:03:10.000Z',
          },
        ],
      },
      meta: { requestId: REQUEST_ID },
    });
  });
});
