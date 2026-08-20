import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ClockModule } from '../../src/common/time/clock.module';
import { validateEnvironment } from '../../src/config/environment';
import { PrismaModule } from '../../src/infrastructure/database/prisma.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionService } from '../../src/modules/demo/application/demo-session.service';
import { DemoModule } from '../../src/modules/demo/demo.module';
import { HandoffDraftsService } from '../../src/modules/handoffs/application/handoff-drafts.service';
import { HandoffPrechecksService } from '../../src/modules/handoffs/application/handoff-prechecks.service';
import { JobExecutionModule } from '../../src/modules/job-execution/job-execution.module';
import { TaskHandoffJobDispatcher } from '../../src/modules/job-execution/task-handoff-job.dispatcher';
import { TaskService } from '../../src/modules/tasks/application/task.service';

describe('Task/Handoff job dispatcher PostgreSQL integration', () => {
  let fixture: TestingModule;
  let prisma: PrismaService;
  let dispatcher: TaskHandoffJobDispatcher;
  let tasks: TaskService;
  let prechecks: HandoffPrechecksService;
  let drafts: HandoffDraftsService;

  beforeAll(async () => {
    fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          cache: true,
          isGlobal: true,
          validate: validateEnvironment,
        }),
        ClockModule,
        PrismaModule,
        DemoModule,
        JobExecutionModule,
      ],
    }).compile();

    prisma = fixture.get(PrismaService);
    dispatcher = fixture.get(TaskHandoffJobDispatcher);
    tasks = fixture.get(TaskService);
    prechecks = fixture.get(HandoffPrechecksService);
    drafts = fixture.get(HandoffDraftsService);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('세 operation의 예약 Job을 claim하고 terminal 결과까지 publish한다', async () => {
    const created = await fixture
      .get(DemoSessionService)
      .create('SYNTHETIC_MEDICAL_DAY_SHIFT');
    const context = await fixture
      .get(DemoSessionContextResolver)
      .resolve(readPersonaSessionId(created, 'SENDER'));
    const senderShift = await prisma.nurseShift.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        nurseId: context.actorId,
        wardId: context.wardId,
        duty: 'DAY',
      },
      select: { id: true },
    });
    const receiverShift = await prisma.nurseShift.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        wardId: context.wardId,
        duty: 'EVENING',
        nurseId: { not: context.actorId },
      },
      select: { startsAt: true },
    });
    const assignment = await prisma.patientAssignment.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        nurseId: context.actorId,
        wardId: context.wardId,
      },
      select: { patientId: true },
    });
    const timelineEvent = await prisma.timelineEvent.create({
      data: {
        datasetId: context.datasetId,
        logicalKey: `dispatcher-evidence-${randomUUID()}`,
        patientId: assignment.patientId,
        wardId: context.wardId,
        occurredAt: new Date('2026-08-20T01:30:00.000Z'),
        type: 'OBSERVATION',
        source: 'AI_AUDIO',
        sourceReference: 'dispatcher-integration-audio',
        summary: '라운딩 후 통증 재평가가 필요함',
        important: true,
      },
      select: { id: true },
    });
    const extraction = await tasks.reserveExtraction(
      context,
      `dispatcher-task-${randomUUID()}`,
      randomUUID(),
      {
        roundingSessionId: randomUUID(),
        recordIds: [timelineEvent.id],
      },
    );
    const precheck = await prechecks.create(
      context,
      {
        shiftId: senderShift.id,
        targetDuty: 'EVENING',
        date: toSeoulDate(receiverShift.startsAt),
      },
      `dispatcher-precheck-${randomUUID()}`,
      randomUUID(),
    );

    await expect(dispatcher.runOnce()).resolves.toBe(true);

    await expect(
      tasks.findExtractionJob(context, extraction.jobId),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      candidates: [expect.objectContaining({ title: '라운딩 후속 업무 1' })],
    });
    await expect(
      prechecks.get(context, precheck.precheckId),
    ).resolves.toMatchObject({
      job: { status: 'SUCCEEDED' },
    });

    const handoff = await drafts.create(
      context,
      {
        precheckId: precheck.precheckId,
        templateId: 'NURSING_HANDOFF_V1',
        includeUnverified: true,
      },
      `dispatcher-draft-${randomUUID()}`,
      randomUUID(),
    );

    await expect(dispatcher.runOnce()).resolves.toBe(true);
    await expect(drafts.get(context, handoff.handoffId)).resolves.toMatchObject(
      {
        status: 'DRAFT',
      },
    );

    await expect(
      prisma.aiJob.findMany({
        where: {
          datasetId: context.datasetId,
          operation: {
            in: ['tasks.extract', 'handoffs.precheck', 'handoffs.generate'],
          },
        },
        orderBy: { operation: 'asc' },
        select: { operation: true, status: true },
      }),
    ).resolves.toEqual([
      { operation: 'handoffs.generate', status: 'SUCCEEDED' },
      { operation: 'handoffs.precheck', status: 'SUCCEEDED' },
      { operation: 'tasks.extract', status: 'SUCCEEDED' },
    ]);
  });
});

function readPersonaSessionId(
  created: Awaited<ReturnType<DemoSessionService['create']>>,
  persona: 'SENDER' | 'RECEIVER',
): string {
  const session = created.sessions.find((item) => item.persona === persona);
  if (!session) throw new Error(`${persona} demo session이 없습니다.`);
  return session.sessionId;
}

function toSeoulDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
