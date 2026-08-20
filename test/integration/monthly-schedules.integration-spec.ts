import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createPublicOpenApiDocument } from '../../src/openapi/create-public-openapi-document';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionService } from '../../src/modules/demo/application/demo-session.service';
import { MonthlyScheduleService } from '../../src/modules/schedules/application/monthly-schedule.service';
import {
  MONTHLY_SCHEDULE_REPOSITORY,
  type MonthlyScheduleRepository,
} from '../../src/modules/schedules/application/ports/monthly-schedule.repository';

type SessionIds = {
  sender: string;
  receiver: string;
};

describe('Monthly schedules PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repository: MonthlyScheduleRepository;
  let context: DemoSessionContext;
  let secondDatasetContext: DemoSessionContext;
  let sessions: SessionIds;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    repository = app.get<MonthlyScheduleRepository>(
      MONTHLY_SCHEDULE_REPOSITORY,
    );
    const sessionService = app.get(DemoSessionService);
    const resolver = app.get(DemoSessionContextResolver);
    sessions = readSessionIds(
      await sessionService.create('SYNTHETIC_MEDICAL_DAY_SHIFT'),
    );
    context = await resolver.resolve(sessions.sender);
    const secondDatasetSessions = readSessionIds(
      await sessionService.create('SYNTHETIC_MEDICAL_DAY_SHIFT'),
    );
    secondDatasetContext = await resolver.resolve(secondDatasetSessions.sender);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AppModule OpenAPI에 월별 근무표 GET과 PUT을 등록한다', () => {
    const path =
      createPublicOpenApiDocument(app).paths[
        '/api/v1/me/schedules/{yearMonth}'
      ];

    expect(path?.get).toBeDefined();
    expect(path?.put).toBeDefined();
    expect(
      path?.put?.parameters?.some(
        (parameter) =>
          !('$ref' in parameter) &&
          parameter.in === 'header' &&
          parameter.name === 'X-Idempotency-Key' &&
          parameter.required === true,
      ),
    ).toBe(true);
  });

  it('월 전체 교체와 조회를 수행하고 과거 요청은 당시 snapshot으로 replay한다', async () => {
    const firstKey = createKey('first');
    const secondKey = createKey('second');
    const firstBody = {
      expectedVersion: 0,
      entries: [
        { date: '2026-08-02', duty: 'OFF' },
        { date: '2026-08-01', duty: 'DAY' },
      ],
    };

    const first = await putSchedule(
      app,
      sessions.sender,
      '2026-08',
      firstKey,
      firstBody,
    ).expect(200);
    expect(first.body.data).toMatchObject({
      yearMonth: '2026-08',
      version: 1,
      entries: [
        { date: '2026-08-01', duty: 'DAY' },
        { date: '2026-08-02', duty: 'OFF' },
      ],
      totals: { DAY: 1, EVENING: 0, NIGHT: 0, OFF: 1 },
    });

    const second = await putSchedule(
      app,
      sessions.sender,
      '2026-08',
      secondKey,
      { expectedVersion: 1, entries: [] },
    ).expect(200);
    expect(second.body.data).toMatchObject({
      yearMonth: '2026-08',
      version: 2,
      entries: [],
      totals: { DAY: 0, EVENING: 0, NIGHT: 0, OFF: 0 },
    });

    const replay = await putSchedule(
      app,
      sessions.sender,
      '2026-08',
      firstKey,
      firstBody,
    ).expect(200);
    expect(replay.body.data).toEqual(first.body.data);

    const found = await request(app.getHttpServer())
      .get('/api/v1/me/schedules/2026-08')
      .set('X-Demo-Session-Id', sessions.sender)
      .expect(200);
    expect(found.body.data).toEqual(second.body.data);
  });

  it('같은 idempotency key의 다른 payload와 stale version을 거부한다', async () => {
    const key = createKey('reused');
    await putSchedule(app, sessions.sender, '2026-09', key, {
      expectedVersion: 0,
      entries: [{ date: '2026-09-01', duty: 'DAY' }],
    }).expect(200);

    const reused = await putSchedule(app, sessions.sender, '2026-09', key, {
      expectedVersion: 0,
      entries: [{ date: '2026-09-01', duty: 'OFF' }],
    }).expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const stale = await putSchedule(
      app,
      sessions.sender,
      '2026-09',
      createKey('stale'),
      { expectedVersion: 0, entries: [] },
    ).expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { expectedVersion: 0, actualVersion: 1 },
    });
  });

  it('같은 dataset과 ward라도 다른 actor의 근무표는 404로 숨긴다', async () => {
    await putSchedule(app, sessions.sender, '2026-10', createKey('scope'), {
      expectedVersion: 0,
      entries: [],
    }).expect(200);

    const hidden = await request(app.getHttpServer())
      .get('/api/v1/me/schedules/2026-10')
      .set('X-Demo-Session-Id', sessions.receiver)
      .expect(404);
    expect(hidden.body.error.code).toBe('MONTHLY_SCHEDULE_NOT_FOUND');

    await expect(
      repository.find(
        { ...context, datasetId: secondDatasetContext.datasetId },
        '2026-10',
      ),
    ).rejects.toMatchObject({ code: 'MONTHLY_SCHEDULE_NOT_FOUND' });
    await expect(
      repository.find({ ...context, wardId: randomUUID() }, '2026-10'),
    ).rejects.toMatchObject({ code: 'MONTHLY_SCHEDULE_NOT_FOUND' });
  });

  it('동일 월 신규 저장 경쟁에서 하나만 성공하고 다른 요청은 version conflict가 된다', async () => {
    const results = await Promise.all([
      putSchedule(app, sessions.sender, '2026-11', createKey('race-a'), {
        expectedVersion: 0,
        entries: [{ date: '2026-11-01', duty: 'DAY' }],
      }),
      putSchedule(app, sessions.sender, '2026-11', createKey('race-b'), {
        expectedVersion: 0,
        entries: [{ date: '2026-11-01', duty: 'NIGHT' }],
      }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(results.find(({ status }) => status === 409)?.body.error.code).toBe(
      'VERSION_CONFLICT',
    );
  });

  it('같은 key와 payload의 동시 요청은 하나만 저장하고 같은 snapshot을 replay한다', async () => {
    const key = createKey('same-key-race');
    const body = {
      expectedVersion: 0,
      entries: [{ date: '2027-02-01', duty: 'NIGHT' }],
    };

    const results = await Promise.all([
      putSchedule(app, sessions.sender, '2027-02', key, body),
      putSchedule(app, sessions.sender, '2027-02', key, body),
    ]);

    expect(results.map(({ status }) => status)).toEqual([200, 200]);
    expect(results[1].body.data).toEqual(results[0].body.data);
    const stored = await prisma.monthlySchedule.findFirstOrThrow({
      where: { yearMonth: '2027-02' },
      select: { datasetId: true, actorId: true },
    });
    await expect(
      prisma.monthlySchedule.count({
        where: {
          datasetId: stored.datasetId,
          actorId: stored.actorId,
          yearMonth: '2027-02',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.idempotencyRecord.count({
        where: {
          datasetId: stored.datasetId,
          actorId: stored.actorId,
          operation: 'monthly-schedules.put',
          idempotencyKey: key,
        },
      }),
    ).resolves.toBe(1);
  });

  it('schedule 삭제 시 entry와 receipt는 cascade하고 idempotency snapshot 주체는 보존한다', async () => {
    const key = createKey('cascade');
    await putSchedule(app, sessions.sender, '2026-12', key, {
      expectedVersion: 0,
      entries: [{ date: '2026-12-01', duty: 'EVENING' }],
    }).expect(200);

    const schedule = await prisma.monthlySchedule.findFirstOrThrow({
      where: { yearMonth: '2026-12' },
      select: { id: true, datasetId: true },
    });
    const receipt = await prisma.monthlyScheduleReceipt.findFirstOrThrow({
      where: { scheduleId: schedule.id },
      select: { idempotencyRecordId: true },
    });

    await prisma.monthlySchedule.delete({ where: { id: schedule.id } });

    await expect(
      prisma.monthlyScheduleEntry.count({
        where: { datasetId: schedule.datasetId, scheduleId: schedule.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.monthlyScheduleReceipt.count({
        where: { datasetId: schedule.datasetId, scheduleId: schedule.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.idempotencyRecord.count({
        where: { id: receipt.idempotencyRecordId },
      }),
    ).resolves.toBe(1);
  });

  it('schedule과 receipt가 남아 있으면 membership 단독 삭제를 RESTRICT한다', async () => {
    const dataset = await prisma.demoDataset.create({
      data: { scenarioKey: 'SYNTHETIC_MEDICAL_DAY_SHIFT' },
      select: { id: true },
    });
    const nurse = await prisma.nurse.create({
      data: {
        datasetId: dataset.id,
        logicalKey: 'schedule-restrict-nurse',
        displayName: 'Synthetic Schedule Nurse',
      },
      select: { id: true },
    });
    const ward = await prisma.ward.create({
      data: {
        datasetId: dataset.id,
        logicalKey: 'schedule-restrict-ward',
        code: 'SCH-R',
        displayName: 'Synthetic Schedule Ward',
      },
      select: { id: true },
    });
    const membership = await prisma.wardMembership.create({
      data: {
        datasetId: dataset.id,
        logicalKey: 'schedule-restrict-membership',
        nurseId: nurse.id,
        wardId: ward.id,
        role: 'SENDER',
      },
      select: { id: true },
    });
    const isolatedContext = {
      datasetId: dataset.id,
      actorId: nurse.id,
      wardId: ward.id,
    };
    await app
      .get(MonthlyScheduleService)
      .put(isolatedContext, '2027-01', createKey('membership-restrict'), {
        expectedVersion: 0,
        entries: [],
      });

    await expect(
      prisma.wardMembership.delete({ where: { id: membership.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.monthlySchedule.count({ where: { datasetId: dataset.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.monthlyScheduleReceipt.count({
        where: { datasetId: dataset.id },
      }),
    ).resolves.toBe(1);

    await prisma.monthlySchedule.deleteMany({
      where: { datasetId: dataset.id },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { datasetId: dataset.id },
    });
    await prisma.wardMembership.delete({ where: { id: membership.id } });
    await prisma.demoDataset.delete({ where: { id: dataset.id } });
  });
});

function putSchedule(
  app: INestApplication,
  sessionId: string,
  yearMonth: string,
  idempotencyKey: string,
  body: { expectedVersion: number; entries: unknown[] },
) {
  return request(app.getHttpServer())
    .put(`/api/v1/me/schedules/${yearMonth}`)
    .set('X-Demo-Session-Id', sessionId)
    .set('X-Idempotency-Key', idempotencyKey)
    .send(body);
}

function createKey(label: string): string {
  return `${label}-${randomUUID()}`;
}

function readSessionIds(
  created: Awaited<ReturnType<DemoSessionService['create']>>,
): SessionIds {
  const sender = created.sessions.find(({ persona }) => persona === 'SENDER');
  const receiver = created.sessions.find(
    ({ persona }) => persona === 'RECEIVER',
  );

  if (!sender || !receiver) {
    throw new Error('SENDER와 RECEIVER demo session이 필요합니다.');
  }

  return { sender: sender.sessionId, receiver: receiver.sessionId };
}
