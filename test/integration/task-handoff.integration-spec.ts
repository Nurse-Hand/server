import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionService } from '../../src/modules/demo/application/demo-session.service';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import { HandoffActivityService } from '../../src/modules/handoffs/application/handoff-activity.service';
import { HandoffDraftsService } from '../../src/modules/handoffs/application/handoff-drafts.service';
import { HandoffFinalizationService } from '../../src/modules/handoffs/application/handoff-finalization.service';
import { HandoffPrechecksService } from '../../src/modules/handoffs/application/handoff-prechecks.service';
import { TaskHandoffJobDispatcher } from '../../src/modules/job-execution/task-handoff-job.dispatcher';
import { TaskService } from '../../src/modules/tasks/application/task.service';

describe('Task and Handoff PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let context: DemoSessionContext;
  let receiverContext: DemoSessionContext;
  let secondContext: DemoSessionContext;
  let dispatcher: TaskHandoffJobDispatcher;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();

    prisma = app.get(PrismaService);
    dispatcher = app.get(TaskHandoffJobDispatcher);
    ({ sender: context, receiver: receiverContext } =
      await createContexts(app));
    ({ sender: secondContext } = await createContexts(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('Task extraction과 Handoff precheck/draft를 실제 claim 후 terminal publish한다', async () => {
    const evidenceId = randomUUID();
    const patient = await prisma.patient.findFirstOrThrow({
      where: { datasetId: context.datasetId, wardId: context.wardId },
      orderBy: { id: 'asc' },
    });
    const roundingSession = await prisma.roundingSession.create({
      data: {
        datasetId: context.datasetId,
        actorId: context.actorId,
        wardId: context.wardId,
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 60_000),
        completedAt: new Date(),
      },
    });
    await prisma.roundingPatientSegment.create({
      data: {
        id: evidenceId,
        datasetId: context.datasetId,
        roundingSessionId: roundingSession.id,
        patientId: patient.id,
        wardId: context.wardId,
        sequence: 1,
        startedAt: new Date(Date.now() - 60_000),
        endedAt: new Date(),
      },
    });
    await prisma.timelineEvent.create({
      data: {
        id: evidenceId,
        datasetId: context.datasetId,
        logicalKey: `task-extraction-${evidenceId}`,
        patientId: patient.id,
        wardId: context.wardId,
        occurredAt: new Date(),
        type: 'TASK',
        source: 'MANUAL',
        sourceReference: `integration:${evidenceId}`,
        summary: 'Synthetic integration evidence',
      },
    });

    const taskReservation = await app
      .get(TaskService)
      .reserveExtraction(
        context,
        `task-extract-${randomUUID()}`,
        randomUUID(),
        { roundingSessionId: roundingSession.id, recordIds: [evidenceId] },
      );
    await expect(dispatcher.runOnce()).resolves.toBe(true);
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: taskReservation.jobId } }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      resultReference: taskReservation.jobId,
    });
    await expect(
      prisma.taskExtractionCandidate.count({
        where: { datasetId: context.datasetId, jobId: taskReservation.jobId },
      }),
    ).resolves.toBeGreaterThan(0);

    const senderShift = await prisma.nurseShift.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        nurseId: context.actorId,
        wardId: context.wardId,
        duty: 'DAY',
      },
    });
    const receiverShift = await prisma.nurseShift.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        wardId: context.wardId,
        duty: 'EVENING',
      },
    });
    const precheckReservation = await app.get(HandoffPrechecksService).create(
      context,
      {
        shiftId: senderShift.id,
        targetDuty: 'EVENING',
        date: seoulDate(receiverShift.startsAt),
      },
      `precheck-${randomUUID()}`,
      randomUUID(),
    );
    await expect(dispatcher.runOnce()).resolves.toBe(true);
    const precheck = await prisma.handoffPrecheck.findUniqueOrThrow({
      where: { id: precheckReservation.precheckId },
      include: { items: true, aiJob: true },
    });
    expect(precheck.aiJob.status).toBe('SUCCEEDED');
    expect(precheck.aiGeneratedAt).not.toBeNull();
    expect(precheck.items.length).toBeGreaterThan(0);
    for (const item of precheck.items) {
      await app
        .get(HandoffPrechecksService)
        .answerItem(context, precheck.id, item.id, {
          answer: 'NO_ISSUE',
          version: item.version,
        });
    }

    const draftReservation = await app.get(HandoffDraftsService).create(
      context,
      {
        precheckId: precheck.id,
        templateId: 'NURSING_HANDOFF_V1',
        includeUnverified: false,
      },
      `draft-${randomUUID()}`,
      randomUUID(),
    );
    await expect(dispatcher.runOnce()).resolves.toBe(true);
    const handoff = await prisma.handoff.findUniqueOrThrow({
      where: { id: draftReservation.handoffId },
      include: {
        draftPatients: true,
        generationAttempts: { include: { aiJob: true } },
      },
    });
    expect(handoff.status).toBe('DRAFT');
    expect(handoff.draftPatients.length).toBeGreaterThan(0);
    expect(handoff.generationAttempts[0]?.aiJob.status).toBe('SUCCEEDED');

    const finalization = app.get(HandoffFinalizationService);
    const finalizationAttempts = await Promise.allSettled([
      finalization.finalize(
        context,
        handoff.id,
        { version: handoff.version, unverifiedHandling: 'RESOLVED' },
        `finalize-a-${randomUUID()}`,
        randomUUID(),
      ),
      finalization.finalize(
        context,
        handoff.id,
        { version: handoff.version, unverifiedHandling: 'RESOLVED' },
        `finalize-b-${randomUUID()}`,
        randomUUID(),
      ),
    ]);
    expect(
      finalizationAttempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      finalizationAttempts.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    expect(
      await prisma.handoffFinalSnapshot.count({
        where: { datasetId: context.datasetId, handoffId: handoff.id },
      }),
    ).toBe(1);

    const activity = app.get(HandoffActivityService);
    await Promise.all([
      activity.history(receiverContext, handoff.id, {}),
      activity.history(receiverContext, handoff.id, {}),
    ]);
    expect(
      await prisma.handoffAuditEvent.count({
        where: {
          datasetId: context.datasetId,
          handoffId: handoff.id,
          eventType: 'FIRST_VIEWED',
        },
      }),
    ).toBe(1);
  });

  it('Task와 Handoff의 composite FK가 다른 dataset resource 연결을 거부한다', async () => {
    const foreignPatient = await prisma.patient.findFirstOrThrow({
      where: { datasetId: secondContext.datasetId },
    });

    await expect(
      prisma.task.create({
        data: {
          datasetId: context.datasetId,
          actorId: context.actorId,
          wardId: context.wardId,
          patientId: foreignPatient.id,
          title: 'Cross dataset task must fail',
          workDate: new Date('2026-08-19T00:00:00.000Z'),
          source: 'MANUAL',
          rulePriority: 'NORMAL',
        },
      }),
    ).rejects.toBeDefined();

    expect(
      await prisma.task.count({
        where: { datasetId: context.datasetId, patientId: foreignPatient.id },
      }),
    ).toBe(0);
  });

  it('dispatcher queue index와 Task/Handoff composite FK를 catalog에서 고정한다', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname::text AS indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'AiJob_dispatch_queue_idx'
    `;
    expect(indexes).toEqual([{ indexname: 'AiJob_dispatch_queue_idx' }]);

    const constraints = await prisma.$queryRaw<
      Array<{ table_name: string; columns: string[] }>
    >`
      SELECT
        tc.table_name::text AS table_name,
        array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_schema = current_schema()
        AND tc.constraint_type = 'FOREIGN KEY'
        AND (tc.table_name LIKE 'Task%' OR tc.table_name LIKE 'Handoff%')
      GROUP BY tc.table_name, tc.constraint_name
    `;
    expect(constraints.length).toBeGreaterThan(20);
    expect(
      constraints.every(({ columns }) => columns.includes('datasetId')),
    ).toBe(true);
  });
});

async function createContexts(
  app: INestApplication,
): Promise<{ sender: DemoSessionContext; receiver: DemoSessionContext }> {
  const created = await app
    .get(DemoSessionService)
    .create('SYNTHETIC_MEDICAL_DAY_SHIFT');
  const sender = created.sessions.find(({ persona }) => persona === 'SENDER');
  const receiver = created.sessions.find(
    ({ persona }) => persona === 'RECEIVER',
  );
  if (!sender) throw new Error('SENDER demo session이 없습니다.');
  if (!receiver) throw new Error('RECEIVER demo session이 없습니다.');
  const resolver = app.get(DemoSessionContextResolver);
  return {
    sender: await resolver.resolve(sender.sessionId),
    receiver: await resolver.resolve(receiver.sessionId),
  };
}

function seoulDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
