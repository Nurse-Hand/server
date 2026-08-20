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
import { PatientCommandService } from '../../src/modules/patients/application/patient-command.service';
import { PatientQueryService } from '../../src/modules/patients/application/patient-query.service';
import { PatientsController } from '../../src/modules/patients/presentation/patients.controller';

const DEMO_SESSION_ID = 'synthetic-patient-session';
const DATASET_ID = '10000000-0000-4000-8000-000000000101';
const ACTOR_ID = '10000000-0000-4000-8000-000000000201';
const WARD_ID = '10000000-0000-4000-8000-000000000301';
const PATIENT_ID = '10000000-0000-4000-8000-000000000401';
const TIMELINE_EVENT_ID = '10000000-0000-4000-8000-000000000402';
const REQUEST_ID = '10000000-0000-4000-8000-000000000501';
const NOW = new Date('2026-08-20T02:00:00.000Z');

const DEMO_CONTEXT: DemoSessionContext = {
  datasetId: DATASET_ID,
  actorId: ACTOR_ID,
  wardId: WARD_ID,
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

describe('Patients public API (isolated e2e)', () => {
  let app: INestApplication;
  const queryService = {
    list: jest.fn(),
    get: jest.fn(),
    readTimeline: jest.fn(),
  };
  const commandService = {
    create: jest.fn(),
    update: jest.fn(),
    discharge: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        { provide: PatientQueryService, useValue: queryService },
        { provide: PatientCommandService, useValue: commandService },
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
    const patient = patientReadModel({});
    queryService.list.mockResolvedValue([patient]);
    queryService.get.mockResolvedValue(patient);
    queryService.readTimeline.mockResolvedValue({
      patient,
      workDate: '2026-08-20',
      daySummary: '호흡곤란 없음',
      items: [
        {
          id: TIMELINE_EVENT_ID,
          patientId: PATIENT_ID,
          occurredAt: NOW,
          type: 'OBSERVATION',
          clinicalCategory: 'PAIN',
          source: 'MANUAL',
          summary: '통증 NRS 4점으로 감소',
          important: false,
          confirmationStatus: 'CONFIRMED',
          version: 1,
          sourceReference: 'quick-note:10000000-0000-4000-8000-000000000701',
          updatedAt: NOW,
          updatedByActorId: ACTOR_ID,
        },
      ],
    });
    commandService.create.mockResolvedValue(patientReadModel({}));
    commandService.update.mockResolvedValue(
      patientReadModel({ statusLabel: '관찰' }),
    );
    commandService.discharge.mockResolvedValue(patientReadModel({}));
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /patients는 환자 추가 결과를 envelope로 반환한다', async () => {
    const body = {
      displayName: '환자 C',
      roomLabel: '212호 1번 침상',
      patientCode: 'P-212-01',
      admittedAt: '2026-08-20T09:00:00+09:00',
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/patients')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send(body)
      .expect(201);

    expect(commandService.create).toHaveBeenCalledWith(DEMO_CONTEXT, body);
    expect(response.body).toMatchObject({
      data: {
        patientId: PATIENT_ID,
        displayName: '환자 C',
        roomLabel: '212호 1번 침상',
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('PATCH /patients/{patientId}는 환자 기본정보 수정 결과를 반환한다', async () => {
    const body = {
      statusLabel: '관찰',
      baselineSummary: 'CT 결과 확인 예정',
    };

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/patients/${PATIENT_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send(body)
      .expect(200);

    expect(commandService.update).toHaveBeenCalledWith(
      DEMO_CONTEXT,
      PATIENT_ID,
      body,
    );
    expect(response.body.data.statusLabel).toBe('관찰');
  });

  it('POST /patients/{patientId}/discharge는 퇴원 처리 결과를 반환한다', async () => {
    const body = { dischargedAt: '2026-08-20T18:00:00+09:00' };

    const response = await request(app.getHttpServer())
      .post(`/api/v1/patients/${PATIENT_ID}/discharge`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .set('X-Request-Id', REQUEST_ID)
      .send(body)
      .expect(200);

    expect(commandService.discharge).toHaveBeenCalledWith(
      DEMO_CONTEXT,
      PATIENT_ID,
      body,
    );
    expect(response.body.data.patientId).toBe(PATIENT_ID);
  });

  it('기존 목록, 상세, timeline 조회 route를 유지한다', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/patients')
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/patients/${PATIENT_ID}`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .expect(200);
    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/patients/${PATIENT_ID}/timeline?workDate=2026-08-20`)
      .set('X-Demo-Session-Id', DEMO_SESSION_ID)
      .expect(200);

    expect(timeline.body.data.items).toEqual([
      expect.objectContaining({
        timelineEventId: TIMELINE_EVENT_ID,
        type: 'OBSERVATION',
        clinicalCategory: 'PAIN',
      }),
    ]);

    expect(queryService.list).toHaveBeenCalledWith(DEMO_CONTEXT);
    expect(queryService.get).toHaveBeenCalledWith({
      context: DEMO_CONTEXT,
      patientId: PATIENT_ID,
    });
    expect(queryService.readTimeline).toHaveBeenCalledWith({
      context: DEMO_CONTEXT,
      patientId: PATIENT_ID,
      workDate: '2026-08-20',
    });
  });
});

function patientReadModel(input: {
  statusLabel?: string | null;
  baselineSummary?: string | null;
}) {
  return {
    patientId: PATIENT_ID,
    displayName: '환자 C',
    roomLabel: '212호 1번 침상',
    patientCode: 'P-212-01',
    statusLabel: input.statusLabel ?? '주의',
    department: '소화기내과',
    admittedAt: new Date('2026-08-20T00:00:00.000Z'),
    baselineSummary: input.baselineSummary ?? 'CT 결과 대기 중',
    createdAt: NOW,
  };
}
