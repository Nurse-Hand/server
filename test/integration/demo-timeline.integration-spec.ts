import {
  Body,
  Controller,
  Post,
  Query,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { Clock } from '../../src/common/time/clock';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { createPublicOpenApiDocument } from '../../src/openapi/create-public-openapi-document';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import { digestDemoSessionToken } from '../../src/modules/demo/domain/demo-session-token';
import { DemoScenarioSeeder } from '../../src/modules/demo/infrastructure/demo-scenario.seeder';
import { DemoSessionContextParam } from '../../src/modules/demo/presentation/demo-session-context.decorator';
import {
  TIMELINE_READER,
  type TimelineReader,
} from '../../src/modules/timeline/application/ports/timeline-reader';

@Controller('_test/demo-context')
class DemoContextProbeController {
  @Post()
  read(
    @DemoSessionContextParam() context: DemoSessionContext,
    @Body() _body: unknown,
    @Query() _query: unknown,
  ): DemoSessionContext {
    void _body;
    void _query;
    return context;
  }
}

class MutableClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(value: Date): void {
    this.current = value;
  }
}

type CreatedSession = {
  sessionId: string;
  context: DemoSessionContext;
  receiverSessionId: string;
  receiverContext: DemoSessionContext;
  expiresAt: string;
};

describe('Demo session and Timeline PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let timelineReader: TimelineReader;
  let firstSession: CreatedSession;
  let secondSession: CreatedSession;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [DemoContextProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    timelineReader = app.get<TimelineReader>(TIMELINE_READER);
    firstSession = await createSession(app);
    secondSession = await createSession(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Health와 demo session 생성만 header 없이 명시적으로 허용한다', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/demo-sessions')
      .send({ scenarioKey: 'SYNTHETIC_MEDICAL_DAY_SHIFT' })
      .expect(201);
  });

  it('scenario allowlist 밖 값과 임의 scope field를 validation에서 거부한다', async () => {
    const invalidScenario = await request(app.getHttpServer())
      .post('/api/v1/demo-sessions')
      .send({ scenarioKey: 'UNLISTED_SCENARIO' })
      .expect(400);
    expect(invalidScenario.body.error.code).toBe('VALIDATION_FAILED');

    const injectedScope = await request(app.getHttpServer())
      .post('/api/v1/demo-sessions')
      .send({
        scenarioKey: 'SYNTHETIC_MEDICAL_DAY_SHIFT',
        userId: 'spoofed-user',
        wardId: 'spoofed-ward',
        hospitalId: 'spoofed-hospital',
      })
      .expect(400);
    expect(injectedScope.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('OpenAPI artifact source에 demo endpoint와 header security scheme을 포함한다', () => {
    const document = createPublicOpenApiDocument(app);

    expect(document.paths['/api/v1/demo-sessions']?.post).toBeDefined();
    expect(document.security).toEqual([{ 'demo-session': [] }]);
    expect(document.paths['/api/v1/health']?.get?.security).toEqual([]);
    expect(document.paths['/api/v1/demo-sessions']?.post?.security).toEqual([]);
    expect(
      document.components?.securitySchemes?.['demo-session'],
    ).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'X-Demo-Session-Id',
    });
  });

  it('한 POST가 SENDER와 RECEIVER session을 같은 dataset/ward에 발급한다', () => {
    expect(firstSession.sessionId).not.toBe(firstSession.receiverSessionId);
    expect(firstSession.receiverContext.datasetId).toBe(
      firstSession.context.datasetId,
    );
    expect(firstSession.receiverContext.wardId).toBe(
      firstSession.context.wardId,
    );
    expect(firstSession.receiverContext.actorId).not.toBe(
      firstSession.context.actorId,
    );
  });

  it('보호 route는 session header 누락/invalid/expired를 각각 401로 구분한다', async () => {
    const missing = await request(app.getHttpServer())
      .post('/api/v1/_test/demo-context')
      .send({})
      .expect(401);
    expect(missing.body.error.code).toBe('DEMO_SESSION_REQUIRED');

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/_test/demo-context')
      .set('X-Demo-Session-Id', 'invalid-opaque-session')
      .send({})
      .expect(401);
    expect(invalid.body.error.code).toBe('DEMO_SESSION_INVALID');

    const expiring = await createSession(app);
    const now = new Date();
    await prisma.demoSession.update({
      where: { tokenDigest: digestDemoSessionToken(expiring.sessionId) },
      data: {
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
    });

    const expired = await request(app.getHttpServer())
      .post('/api/v1/_test/demo-context')
      .set('X-Demo-Session-Id', expiring.sessionId)
      .send({})
      .expect(401);
    expect(expired.body.error.code).toBe('DEMO_SESSION_EXPIRED');
  });

  it('body/query scope 값이 검증된 session context를 덮어쓰지 못한다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/_test/demo-context?wardId=spoofed-ward')
      .set('X-Demo-Session-Id', firstSession.sessionId)
      .send({
        datasetId: secondSession.context.datasetId,
        actorId: secondSession.context.actorId,
        wardId: secondSession.context.wardId,
      })
      .expect(201);

    expect(response.body.data).toEqual(firstSession.context);
  });

  it('같은 scenario의 session마다 dataset과 모든 resource UUID를 새로 만든다', async () => {
    expect(firstSession.context.datasetId).not.toBe(
      secondSession.context.datasetId,
    );

    const firstIds = await readDatasetResourceIds(
      prisma,
      firstSession.context.datasetId,
    );
    const secondIds = await readDatasetResourceIds(
      prisma,
      secondSession.context.datasetId,
    );

    expect(firstIds.length).toBeGreaterThan(0);
    expect(secondIds.length).toBe(firstIds.length);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
  });

  it('opaque token 원문은 저장하지 않고 SHA-256 digest만 저장한다', async () => {
    const rawTokens = [firstSession.sessionId, firstSession.receiverSessionId];
    const digests = rawTokens.map(digestDemoSessionToken);
    const stored = await prisma.demoSession.findMany({
      where: { datasetId: firstSession.context.datasetId },
    });

    expect(stored.map(({ tokenDigest }) => tokenDigest).sort()).toEqual(
      [...digests].sort(),
    );
    expect(
      stored.every(({ tokenDigest }) => /^[a-f0-9]{64}$/.test(tokenDigest)),
    ).toBe(true);
    for (const rawToken of rawTokens) {
      expect(JSON.stringify(stored)).not.toContain(rawToken);
    }
  });

  it('dataset+actor session unique와 7시간 TTL/현재 sender shift 경계를 DB가 지킨다', async () => {
    const sessions = await prisma.demoSession.findMany({
      where: { datasetId: firstSession.context.datasetId },
      orderBy: { actorNurseId: 'asc' },
    });
    const senderShift = await prisma.nurseShift.findFirstOrThrow({
      where: {
        datasetId: firstSession.context.datasetId,
        nurseId: firstSession.context.actorId,
        wardId: firstSession.context.wardId,
        duty: 'DAY',
      },
    });
    const senderAssignments = await prisma.patientAssignment.findMany({
      where: {
        datasetId: firstSession.context.datasetId,
        nurseId: firstSession.context.actorId,
        wardId: firstSession.context.wardId,
      },
    });

    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map(({ actorNurseId }) => actorNurseId)).size).toBe(
      2,
    );
    expect(
      sessions.every(
        ({ expiresAt }) => expiresAt.toISOString() === firstSession.expiresAt,
      ),
    ).toBe(true);
    for (const session of sessions) {
      expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(
        7 * 60 * 60 * 1000,
      );
      expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
        senderShift.endsAt.getTime(),
      );
    }
    expect(senderAssignments).not.toHaveLength(0);
    expect(
      senderAssignments.every(
        ({ endsAt }) =>
          endsAt !== null &&
          sessions[0].expiresAt.getTime() <= endsAt.getTime(),
      ),
    ).toBe(true);

    await expect(
      prisma.demoSession.create({
        data: {
          datasetId: sessions[0].datasetId,
          tokenDigest: 'f'.repeat(64),
          actorNurseId: sessions[0].actorNurseId,
          wardId: sessions[0].wardId,
          createdAt: sessions[0].createdAt,
          expiresAt: sessions[0].expiresAt,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('DemoSession DB CHECK가 7시간을 1ms라도 넘는 TTL을 거부한다', async () => {
    const now = new Date('2026-08-18T00:00:00.000Z');
    const dataset = await prisma.demoDataset.create({
      data: { scenarioKey: 'SYNTHETIC_MEDICAL_DAY_SHIFT' },
      select: { id: true },
    });
    const seeder = new DemoScenarioSeeder(new MutableClock(now));
    const seeded = await prisma.$transaction((transaction) =>
      seeder.seed(transaction, dataset.id, 'SYNTHETIC_MEDICAL_DAY_SHIFT'),
    );

    await expect(
      prisma.demoSession.create({
        data: {
          datasetId: dataset.id,
          tokenDigest: 'e'.repeat(64),
          actorNurseId: seeded.actorId,
          wardId: seeded.wardId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 7 * 60 * 60 * 1000 + 1),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2004' });
  });

  it('동일 dataset 재seed는 UUID와 row 수를 유지하고 Clock 기준 시간을 갱신한다', async () => {
    const dataset = await prisma.demoDataset.create({
      data: { scenarioKey: 'SYNTHETIC_MEDICAL_DAY_SHIFT' },
      select: { id: true },
    });
    const clock = new MutableClock(new Date('2026-08-18T00:00:00.000Z'));
    const seeder = new DemoScenarioSeeder(clock);
    const first = await prisma.$transaction((transaction) =>
      seeder.seed(transaction, dataset.id, 'SYNTHETIC_MEDICAL_DAY_SHIFT'),
    );
    const firstCounts = await readDatasetCounts(prisma, dataset.id);
    const firstIds = await readDatasetResourceIds(prisma, dataset.id);

    clock.set(new Date('2026-08-18T02:00:00.000Z'));
    const second = await prisma.$transaction((transaction) =>
      seeder.seed(transaction, dataset.id, 'SYNTHETIC_MEDICAL_DAY_SHIFT'),
    );
    const secondCounts = await readDatasetCounts(prisma, dataset.id);
    const secondIds = await readDatasetResourceIds(prisma, dataset.id);
    const shifts = await prisma.nurseShift.findMany({
      where: { datasetId: dataset.id },
      orderBy: { logicalKey: 'asc' },
      select: {
        logicalKey: true,
        duty: true,
        startsAt: true,
        endsAt: true,
      },
    });
    const assignments = await prisma.patientAssignment.findMany({
      where: { datasetId: dataset.id },
      select: { startsAt: true, endsAt: true },
    });
    const events = await prisma.timelineEvent.findMany({
      where: { datasetId: dataset.id },
      orderBy: { logicalKey: 'asc' },
      select: { occurredAt: true },
    });

    expect({
      actorId: second.actorId,
      receiverId: second.receiverId,
      wardId: second.wardId,
      nurseIds: second.nurseIds,
      patientIds: second.patientIds,
      timelineEventIds: second.timelineEventIds,
    }).toEqual({
      actorId: first.actorId,
      receiverId: first.receiverId,
      wardId: first.wardId,
      nurseIds: first.nurseIds,
      patientIds: first.patientIds,
      timelineEventIds: first.timelineEventIds,
    });
    expect(first.senderShiftEndsAt.toISOString()).toBe(
      '2026-08-18T07:00:00.000Z',
    );
    expect(second.senderShiftEndsAt.toISOString()).toBe(
      '2026-08-18T09:00:00.000Z',
    );
    expect(secondCounts).toEqual(firstCounts);
    expect(secondIds).toEqual(firstIds);
    expect(
      shifts.map(({ logicalKey, duty, startsAt, endsAt }) => ({
        logicalKey,
        duty,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      })),
    ).toEqual([
      {
        logicalKey: 'shift-receiver-evening-a',
        duty: 'EVENING',
        startsAt: '2026-08-18T09:00:00.000Z',
        endsAt: '2026-08-18T17:00:00.000Z',
      },
      {
        logicalKey: 'shift-sender-day-a',
        duty: 'DAY',
        startsAt: '2026-08-18T01:00:00.000Z',
        endsAt: '2026-08-18T09:00:00.000Z',
      },
    ]);
    expect(
      assignments.every(
        (assignment) =>
          assignment.startsAt.toISOString() === '2026-08-18T01:00:00.000Z' &&
          assignment.endsAt?.toISOString() === '2026-08-18T09:00:00.000Z',
      ),
    ).toBe(true);
    expect(events.map(({ occurredAt }) => occurredAt.toISOString())).toEqual([
      '2026-08-18T01:30:00.000Z',
      '2026-08-18T01:45:00.000Z',
    ]);
  });

  it('TimelineReader batch는 중복 환자를 제거하고 inclusive 경계와 안정 정렬을 지킨다', async () => {
    const patients = await prisma.patient.findMany({
      where: { datasetId: firstSession.context.datasetId },
      orderBy: { logicalKey: 'asc' },
      take: 2,
      select: { id: true },
    });
    expect(patients).toHaveLength(2);
    const occurredAt = new Date();
    const lowerId = '10000000-0000-4000-8000-000000000901';
    const higherId = '10000000-0000-4000-8000-000000000902';

    await prisma.timelineEvent.createMany({
      data: [
        {
          id: lowerId,
          datasetId: firstSession.context.datasetId,
          logicalKey: 'timeline-boundary-lower',
          patientId: patients[0].id,
          wardId: firstSession.context.wardId,
          occurredAt,
          type: 'OBSERVATION',
          source: 'MANUAL',
          sourceReference: 'synthetic:boundary:lower',
          summary: 'Synthetic boundary lower',
        },
        {
          id: higherId,
          datasetId: firstSession.context.datasetId,
          logicalKey: 'timeline-boundary-higher',
          patientId: patients[1].id,
          wardId: firstSession.context.wardId,
          occurredAt,
          type: 'TASK',
          source: 'AI_AUDIO',
          sourceReference: 'synthetic:boundary:higher',
          summary: 'Synthetic boundary higher',
        },
      ],
    });

    const events = await timelineReader.readMany({
      context: firstSession.context,
      patientIds: [patients[0].id, patients[1].id, patients[0].id],
      from: occurredAt,
      to: occurredAt,
    });

    expect(events.map(({ id }) => id)).toEqual([higherId, lowerId]);
    expect(events[0]).toMatchObject({
      id: higherId,
      patientId: patients[1].id,
      occurredAt,
      type: 'TASK',
      source: 'AI_AUDIO',
      summary: 'Synthetic boundary higher',
      version: 1,
      sourceReference: 'synthetic:boundary:higher',
    });
  });

  it('다른 dataset, ward, 미배정 환자는 동일한 404로 숨긴다', async () => {
    const otherPatient = await prisma.patient.findFirstOrThrow({
      where: { datasetId: secondSession.context.datasetId },
      select: { id: true },
    });
    const unassigned = await prisma.patient.create({
      data: {
        datasetId: firstSession.context.datasetId,
        wardId: firstSession.context.wardId,
        logicalKey: 'patient-unassigned',
        displayName: 'Synthetic Unassigned Patient',
        roomLabel: 'SYN-U',
      },
      select: { id: true },
    });
    const assigned = await prisma.patient.findFirstOrThrow({
      where: {
        datasetId: firstSession.context.datasetId,
        wardId: firstSession.context.wardId,
        patientAssignments: {
          some: {
            nurseId: firstSession.context.actorId,
            wardId: firstSession.context.wardId,
          },
        },
      },
      select: { id: true },
    });

    for (const input of [
      { context: firstSession.context, patientId: otherPatient.id },
      {
        context: {
          ...firstSession.context,
          wardId: '20000000-0000-4000-8000-000000000999',
        },
        patientId: assigned.id,
      },
      { context: firstSession.context, patientId: unassigned.id },
    ]) {
      await expect(timelineReader.read(input)).rejects.toMatchObject({
        code: 'PATIENT_NOT_FOUND',
        kind: 'NOT_FOUND',
      });
    }
  });

  it('만료된 배정은 과거 접근 이력으로 사용하지 않고 404 처리한다', async () => {
    const now = new Date();
    const assignment = await prisma.patientAssignment.findFirstOrThrow({
      where: {
        datasetId: firstSession.context.datasetId,
        nurseId: firstSession.context.actorId,
        wardId: firstSession.context.wardId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      select: { id: true, patientId: true },
    });
    const expired = await prisma.patientAssignment.update({
      where: { id: assignment.id },
      data: {
        startsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
      select: { id: true },
    });

    expect(expired.id).toBe(assignment.id);

    await expect(
      timelineReader.read({
        context: firstSession.context,
        patientId: assignment.patientId,
      }),
    ).rejects.toMatchObject({ code: 'PATIENT_NOT_FOUND' });
  });

  it('cross-dataset child reference를 PostgreSQL composite FK가 거부한다', async () => {
    const otherPatient = await prisma.patient.findFirstOrThrow({
      where: { datasetId: secondSession.context.datasetId },
      select: { id: true },
    });

    await expect(
      prisma.timelineEvent.create({
        data: {
          datasetId: firstSession.context.datasetId,
          logicalKey: 'cross-dataset-event',
          patientId: otherPatient.id,
          wardId: firstSession.context.wardId,
          occurredAt: new Date(),
          type: 'OBSERVATION',
          source: 'MANUAL',
          sourceReference: 'synthetic:cross-dataset',
          summary: 'Synthetic cross dataset attempt',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('모든 non-root FK는 datasetId가 포함된 composite constraint다', async () => {
    const constraints = await prisma.$queryRaw<
      Array<{ tableName: string; constraintName: string; columns: string[] }>
    >`
      SELECT
        tc.table_name AS "tableName",
        tc.constraint_name AS "constraintName",
        array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS "columns"
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_schema = current_schema()
        AND tc.constraint_type = 'FOREIGN KEY'
      GROUP BY tc.table_name, tc.constraint_name
    `;
    const nonRoot = constraints.filter(
      ({ constraintName }) => !constraintName.endsWith('_datasetId_fkey'),
    );

    expect(nonRoot.length).toBeGreaterThan(0);
    expect(
      nonRoot.every(
        ({ columns }) => columns.length > 1 && columns[0] === 'datasetId',
      ),
    ).toBe(true);
  });

  it('Prisma DSL 밖의 Foundation CHECK constraint를 migration이 모두 설치한다', async () => {
    const constraints = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT constraint_name AS "name"
      FROM information_schema.table_constraints
      WHERE constraint_schema = current_schema()
        AND constraint_type = 'CHECK'
    `;

    expect(constraints.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'NurseShift_time_check',
        'PatientAssignment_time_check',
        'TimelineEvent_version_check',
        'DemoSession_token_digest_check',
        'DemoSession_ttl_check',
        'AiJob_attempt_check',
        'AiJob_version_check',
        'AiJob_state_check',
        'IdempotencyRecord_hash_check',
        'IdempotencyRecord_state_check',
      ]),
    );
  });
});

async function createSession(app: INestApplication): Promise<CreatedSession> {
  const created = await request(app.getHttpServer())
    .post('/api/v1/demo-sessions')
    .send({ scenarioKey: 'SYNTHETIC_MEDICAL_DAY_SHIFT' })
    .expect(201);
  const credentials = created.body.data.sessions as Array<{
    persona: 'SENDER' | 'RECEIVER';
    sessionId: string;
  }>;
  const sender = credentials.find(({ persona }) => persona === 'SENDER');
  const receiver = credentials.find(({ persona }) => persona === 'RECEIVER');

  expect(credentials).toHaveLength(2);
  expect(sender).toBeDefined();
  expect(receiver).toBeDefined();

  const senderProbe = await request(app.getHttpServer())
    .post('/api/v1/_test/demo-context')
    .set('X-Demo-Session-Id', sender!.sessionId)
    .send({})
    .expect(201);
  const receiverProbe = await request(app.getHttpServer())
    .post('/api/v1/_test/demo-context')
    .set('X-Demo-Session-Id', receiver!.sessionId)
    .send({})
    .expect(201);

  return {
    sessionId: sender!.sessionId,
    context: senderProbe.body.data as DemoSessionContext,
    receiverSessionId: receiver!.sessionId,
    receiverContext: receiverProbe.body.data as DemoSessionContext,
    expiresAt: created.body.data.expiresAt as string,
  };
}

async function readDatasetResourceIds(
  prisma: PrismaService,
  datasetId: string,
): Promise<string[]> {
  const [
    sessions,
    nurses,
    wards,
    memberships,
    shifts,
    patients,
    assignments,
    events,
  ] = await Promise.all([
    prisma.demoSession.findMany({
      where: { datasetId },
      select: { id: true },
    }),
    prisma.nurse.findMany({ where: { datasetId }, select: { id: true } }),
    prisma.ward.findMany({ where: { datasetId }, select: { id: true } }),
    prisma.wardMembership.findMany({
      where: { datasetId },
      select: { id: true },
    }),
    prisma.nurseShift.findMany({
      where: { datasetId },
      select: { id: true },
    }),
    prisma.patient.findMany({ where: { datasetId }, select: { id: true } }),
    prisma.patientAssignment.findMany({
      where: { datasetId },
      select: { id: true },
    }),
    prisma.timelineEvent.findMany({
      where: { datasetId },
      select: { id: true },
    }),
  ]);

  return [
    ...sessions,
    ...nurses,
    ...wards,
    ...memberships,
    ...shifts,
    ...patients,
    ...assignments,
    ...events,
  ]
    .map(({ id }) => id)
    .sort();
}

async function readDatasetCounts(prisma: PrismaService, datasetId: string) {
  const [nurses, wards, memberships, shifts, patients, assignments, events] =
    await Promise.all([
      prisma.nurse.count({ where: { datasetId } }),
      prisma.ward.count({ where: { datasetId } }),
      prisma.wardMembership.count({ where: { datasetId } }),
      prisma.nurseShift.count({ where: { datasetId } }),
      prisma.patient.count({ where: { datasetId } }),
      prisma.patientAssignment.count({ where: { datasetId } }),
      prisma.timelineEvent.count({ where: { datasetId } }),
    ]);

  return { nurses, wards, memberships, shifts, patients, assignments, events };
}
