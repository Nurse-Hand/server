import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AiJobService } from '../../src/modules/ai-jobs/application/ai-job.service';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionService } from '../../src/modules/demo/application/demo-session.service';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import { HandoffActivityService } from '../../src/modules/handoffs/application/handoff-activity.service';
import { HandoffDraftsService } from '../../src/modules/handoffs/application/handoff-drafts.service';
import { HandoffFinalizationService } from '../../src/modules/handoffs/application/handoff-finalization.service';
import { HandoffPrechecksService } from '../../src/modules/handoffs/application/handoff-prechecks.service';
import { TaskHandoffJobDispatcher } from '../../src/modules/job-execution/task-handoff-job.dispatcher';
import { TaskService } from '../../src/modules/tasks/application/task.service';
import {
  TASK_REPOSITORY,
  type TaskRepository,
} from '../../src/modules/tasks/application/ports/task.repository';
import {
  TASK_APPLY_OPERATION,
  TASK_EXTRACTION_OPERATION,
} from '../../src/modules/tasks/domain/task.types';

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
    const segmentId = randomUUID();
    const timelineEventId = randomUUID();
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
        id: segmentId,
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
        id: timelineEventId,
        datasetId: context.datasetId,
        logicalKey: `task-extraction-${timelineEventId}`,
        patientId: patient.id,
        wardId: context.wardId,
        occurredAt: new Date(),
        type: 'TASK',
        source: 'MANUAL',
        sourceReference: `integration:${timelineEventId}`,
        summary: 'Synthetic integration evidence',
      },
    });

    const taskReservation = await app
      .get(TaskService)
      .reserveExtraction(
        context,
        `task-extract-${randomUUID()}`,
        randomUUID(),
        { roundingSessionId: roundingSession.id, recordIds: [segmentId] },
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
    await expect(
      prisma.taskExtractionEvidence.findFirstOrThrow({
        where: { datasetId: context.datasetId, jobId: taskReservation.jobId },
        select: {
          roundingRecordId: true,
          sourceType: true,
          timelineEventId: true,
        },
      }),
    ).resolves.toEqual({
      roundingRecordId: segmentId,
      sourceType: 'ROUNDING_SEGMENT',
      timelineEventId: null,
    });

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
    const finalSnapshot = await prisma.handoffFinalSnapshot.findFirstOrThrow({
      where: { datasetId: context.datasetId, handoffId: handoff.id },
    });
    await expect(
      prisma.handoffFinalSnapshot.update({
        where: { id: finalSnapshot.id },
        data: { snapshotHash: 'f'.repeat(64) },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.handoffFinalSnapshot.delete({
        where: { id: finalSnapshot.id },
      }),
    ).rejects.toBeDefined();
    const duplicateRecord = await prisma.idempotencyRecord.create({
      data: {
        ...context,
        operation: 'handoffs.finalize',
        idempotencyKey: `snapshot-regeneration-${randomUUID()}`,
        requestHash: 'a'.repeat(64),
      },
    });
    await expect(
      prisma.$executeRaw`
        INSERT INTO "HandoffFinalSnapshot" (
          "id", "datasetId", "wardId", "handoffId", "senderActorId",
          "receiverActorId", "finalizedByActorId", "operation", "resolution",
          "sourceDraftVersion", "precheckVersion", "templateKey",
          "includeUnverified", "idempotencyRecordId", "requestHash",
          "snapshotPayload", "snapshotHash", "version", "finalizedAt", "createdAt"
        )
        SELECT
          ${randomUUID()}::uuid, "datasetId", "wardId", "handoffId",
          "senderActorId", "receiverActorId", "finalizedByActorId", "operation",
          "resolution", "sourceDraftVersion", "precheckVersion", "templateKey",
          "includeUnverified", ${duplicateRecord.id}::uuid, "requestHash",
          "snapshotPayload", "snapshotHash", "version", "finalizedAt", NOW()
        FROM "HandoffFinalSnapshot"
        WHERE "id" = ${finalSnapshot.id}::uuid
      `,
    ).rejects.toBeDefined();
    await expect(
      prisma.handoffFinalSnapshot.findUniqueOrThrow({
        where: { id: finalSnapshot.id },
      }),
    ).resolves.toEqual(finalSnapshot);
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

  it('Task create는 동시 same-key를 한 row로 수렴하고 replay와 hash conflict를 구분한다', async () => {
    const patient = await findActivePatient(prisma, context);
    const taskService = app.get(TaskService);
    const idempotencyKey = `task-create-${randomUUID()}`;
    const command = {
      patientId: patient.id,
      title: 'Synthetic concurrent task',
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    const concurrent = await Promise.all([
      taskService.create(context, idempotencyKey, randomUUID(), command),
      taskService.create(context, idempotencyKey, randomUUID(), command),
    ]);
    expect(new Set(concurrent.map(({ task }) => task.id)).size).toBe(1);
    expect(concurrent.map(({ isReplay }) => isReplay).sort()).toEqual([
      false,
      true,
    ]);

    const replay = await taskService.create(
      context,
      idempotencyKey,
      randomUUID(),
      command,
    );
    expect(replay).toMatchObject({
      task: { id: concurrent[0]?.task.id },
      isReplay: true,
    });
    await expect(
      taskService.create(context, idempotencyKey, randomUUID(), {
        ...command,
        title: 'Synthetic hash conflict',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(
      await prisma.task.count({
        where: {
          datasetId: context.datasetId,
          title: command.title,
        },
      }),
    ).toBe(1);
  });

  it('Task stale PATCH는 version conflict이고 저장된 최신 row를 되돌리지 않는다', async () => {
    const patient = await findActivePatient(prisma, context);
    const taskService = app.get(TaskService);
    const created = await taskService.create(
      context,
      `stale-task-${randomUUID()}`,
      randomUUID(),
      {
        patientId: patient.id,
        title: 'Synthetic stale target',
        dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    );
    const updated = await taskService.update(context, created.task.id, {
      version: created.task.version,
      title: 'Synthetic latest title',
    });

    await expect(
      taskService.update(context, created.task.id, {
        version: created.task.version,
        title: 'Synthetic stale overwrite',
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(
      prisma.task.findUniqueOrThrow({ where: { id: created.task.id } }),
    ).resolves.toMatchObject({
      title: updated.title,
      version: updated.version,
    });
  });

  it('Task patient assignment, ward, actor scope 밖 resource는 동일한 404로 숨긴다', async () => {
    const patient = await findActivePatient(prisma, context);
    const unassigned = await prisma.patient.create({
      data: {
        datasetId: context.datasetId,
        logicalKey: `unassigned-${randomUUID()}`,
        wardId: context.wardId,
        displayName: 'Synthetic unassigned patient',
        roomLabel: 'S-404',
      },
    });
    const taskService = app.get(TaskService);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const attempts = [
      {
        context,
        patientId: unassigned.id,
        key: `unassigned-${randomUUID()}`,
      },
      {
        context: receiverContext,
        patientId: patient.id,
        key: `wrong-actor-${randomUUID()}`,
      },
      {
        context: { ...context, wardId: randomUUID() },
        patientId: patient.id,
        key: `wrong-ward-${randomUUID()}`,
      },
    ];

    for (const attempt of attempts) {
      await expect(
        taskService.create(attempt.context, attempt.key, randomUUID(), {
          patientId: attempt.patientId,
          title: 'Synthetic forbidden scope task',
          dueAt,
        }),
      ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND', kind: 'NOT_FOUND' });
    }
    expect(
      await prisma.task.count({
        where: {
          datasetId: context.datasetId,
          title: 'Synthetic forbidden scope task',
        },
      }),
    ).toBe(0);
  });

  it('Task candidate 동시 apply는 한 번만 반영하고 실패 transaction은 예약부터 rollback한다', async () => {
    const taskService = app.get(TaskService);
    const concurrentFixture = await publishSyntheticExtraction(
      app,
      prisma,
      dispatcher,
      context,
    );
    const concurrentResults = await Promise.allSettled([
      taskService.applyCandidates(
        context,
        concurrentFixture.jobId,
        `apply-a-${randomUUID()}`,
        {
          items: [
            { candidateId: concurrentFixture.candidateId, selected: true },
          ],
        },
      ),
      taskService.applyCandidates(
        context,
        concurrentFixture.jobId,
        `apply-b-${randomUUID()}`,
        {
          items: [
            { candidateId: concurrentFixture.candidateId, selected: true },
          ],
        },
      ),
    ]);
    expect(
      concurrentResults.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      concurrentResults.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    const appliedCandidate =
      await prisma.taskExtractionCandidate.findUniqueOrThrow({
        where: { id: concurrentFixture.candidateId },
      });
    expect(appliedCandidate.appliedTaskId).not.toBeNull();
    expect(
      await prisma.taskApplyReceipt.count({
        where: {
          datasetId: context.datasetId,
          jobId: concurrentFixture.jobId,
        },
      }),
    ).toBe(1);

    const rollbackFixture = await publishSyntheticExtraction(
      app,
      prisma,
      dispatcher,
      context,
    );
    await prisma.taskExtractionCandidate.update({
      where: { id: rollbackFixture.candidateId },
      data: {
        title: 'SYNTHETIC_FORCE_ROLLBACK',
        duplicateTaskId: null,
      },
    });
    const rollbackKey = `apply-rollback-${randomUUID()}`;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "reject_synthetic_task_apply"()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW."title" = 'SYNTHETIC_FORCE_ROLLBACK' THEN
          RAISE EXCEPTION 'synthetic task apply rollback';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER "Task_synthetic_apply_rollback"
      BEFORE INSERT ON "Task"
      FOR EACH ROW
      EXECUTE FUNCTION "reject_synthetic_task_apply"();
    `);
    try {
      await expect(
        taskService.applyCandidates(
          context,
          rollbackFixture.jobId,
          rollbackKey,
          {
            items: [
              {
                candidateId: rollbackFixture.candidateId,
                selected: true,
                title: 'SYNTHETIC_FORCE_ROLLBACK',
              },
            ],
          },
        ),
      ).rejects.toBeDefined();
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS "Task_synthetic_apply_rollback" ON "Task";
        DROP FUNCTION IF EXISTS "reject_synthetic_task_apply"();
      `);
    }
    await expect(
      prisma.taskExtractionCandidate.findUniqueOrThrow({
        where: { id: rollbackFixture.candidateId },
      }),
    ).resolves.toMatchObject({ appliedAt: null, appliedTaskId: null });
    expect(
      await prisma.idempotencyRecord.count({
        where: {
          datasetId: context.datasetId,
          operation: TASK_APPLY_OPERATION,
          idempotencyKey: rollbackKey,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.taskApplyReceipt.count({
        where: {
          datasetId: context.datasetId,
          jobId: rollbackFixture.jobId,
        },
      }),
    ).toBe(0);
  });

  it('Task feature publish는 만료 lease의 stale worker 결과를 전부 rollback한다', async () => {
    const fixture = await reserveSyntheticExtraction(app, prisma, context);
    const claim = await app.get(AiJobService).claimNext({
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: TASK_EXTRACTION_OPERATION,
      leaseMilliseconds: 60_000,
    });
    expect(claim?.jobId).toBe(fixture.jobId);
    if (!claim) throw new Error('Task extraction claim이 없습니다.');

    const repository = app.get<TaskRepository>(TASK_REPOSITORY);
    const workItem = await repository.findExtractionWorkItem(
      context.datasetId,
      fixture.jobId,
    );
    const evidence = workItem.evidence[0];
    if (!evidence) throw new Error('Task extraction evidence가 없습니다.');
    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.aiJob.update({
      where: { id: fixture.jobId },
      data: {
        claimedAt: new Date(expiredAt.getTime() - 60_000),
        leaseExpiresAt: expiredAt,
      },
    });
    await expect(
      repository.completeExtraction({
        claim: {
          jobId: claim.jobId,
          datasetId: claim.datasetId,
          actorId: claim.actorId,
          wardId: claim.wardId,
          leaseVersion: claim.leaseVersion,
        },
        candidates: [
          {
            candidateKey: `stale-${randomUUID()}`,
            patientId: evidence.patientId,
            title: 'Synthetic stale publish',
            description: null,
            dueAt: null,
            workDate: evidence.workDate,
            suggestedPriority: 'NORMAL',
            reasons: ['Synthetic stale lease regression'],
            confidence: 'HIGH',
            evidenceSourceIds: [evidence.sourceId],
          },
        ],
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_CLAIM_LOST' });
    expect(
      await prisma.taskExtractionCandidate.count({
        where: { datasetId: context.datasetId, jobId: fixture.jobId },
      }),
    ).toBe(0);
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: fixture.jobId } }),
    ).resolves.toMatchObject({
      status: 'PROCESSING',
      leaseVersion: claim.leaseVersion,
      resultReference: null,
    });

    await expect(dispatcher.runOnce()).resolves.toBe(true);
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: fixture.jobId } }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
  });

  it('polymorphic Task evidence는 source shape와 source별 중복을 DB에서 거부한다', async () => {
    const patient = await prisma.patient.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        wardId: context.wardId,
        patientAssignments: {
          some: {
            nurseId: context.actorId,
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
          },
        },
      },
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
    const [firstSegment, secondSegment] = await Promise.all([
      prisma.roundingPatientSegment.create({
        data: {
          datasetId: context.datasetId,
          roundingSessionId: roundingSession.id,
          patientId: patient.id,
          wardId: context.wardId,
          sequence: 1,
          startedAt: new Date(Date.now() - 60_000),
          endedAt: new Date(Date.now() - 30_000),
        },
      }),
      prisma.roundingPatientSegment.create({
        data: {
          datasetId: context.datasetId,
          roundingSessionId: roundingSession.id,
          patientId: patient.id,
          wardId: context.wardId,
          sequence: 2,
          startedAt: new Date(Date.now() - 30_000),
          endedAt: new Date(),
        },
      }),
    ]);
    const timelineEvent = await prisma.timelineEvent.create({
      data: {
        datasetId: context.datasetId,
        logicalKey: `evidence-shape-${randomUUID()}`,
        patientId: patient.id,
        wardId: context.wardId,
        occurredAt: new Date(),
        type: 'TASK',
        source: 'MANUAL',
        sourceReference: `integration:${randomUUID()}`,
        summary: 'Synthetic evidence shape fixture',
      },
    });
    const taskService = app.get(TaskService);
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const [{ task }, { task: sourceTask }] = await Promise.all([
      taskService.create(context, `shape-task-${randomUUID()}`, randomUUID(), {
        patientId: patient.id,
        title: 'Synthetic evidence target',
        dueAt,
      }),
      taskService.create(
        context,
        `shape-source-task-${randomUUID()}`,
        randomUUID(),
        {
          patientId: patient.id,
          title: 'Synthetic evidence source',
          dueAt,
        },
      ),
    ]);
    const reservation = await taskService.reserveExtraction(
      context,
      `shape-extraction-${randomUUID()}`,
      randomUUID(),
      {
        roundingSessionId: roundingSession.id,
        recordIds: [firstSegment.id],
      },
    );
    await dispatcher.runOnce();
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: reservation.jobId } }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });

    await expect(
      prisma.taskEvidence.create({
        data: {
          datasetId: context.datasetId,
          taskId: task.id,
          sourceType: 'TIMELINE_EVENT',
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.taskEvidence.create({
        data: {
          datasetId: context.datasetId,
          taskId: task.id,
          sourceType: 'ROUNDING_SEGMENT',
          timelineEventId: timelineEvent.id,
          roundingSegmentId: secondSegment.id,
        },
      }),
    ).rejects.toBeDefined();

    await prisma.taskEvidence.create({
      data: {
        datasetId: context.datasetId,
        taskId: task.id,
        sourceType: 'ROUNDING_SEGMENT',
        roundingSegmentId: firstSegment.id,
      },
    });
    await prisma.taskEvidence.createMany({
      data: [
        {
          datasetId: context.datasetId,
          taskId: task.id,
          sourceType: 'TIMELINE_EVENT',
          timelineEventId: timelineEvent.id,
        },
        {
          datasetId: context.datasetId,
          taskId: task.id,
          sourceType: 'TASK',
          sourceTaskId: sourceTask.id,
        },
      ],
    });
    await expect(
      prisma.taskEvidence.create({
        data: {
          datasetId: context.datasetId,
          taskId: task.id,
          sourceType: 'ROUNDING_SEGMENT',
          roundingSegmentId: firstSegment.id,
        },
      }),
    ).rejects.toBeDefined();

    const extractionBase = {
      datasetId: context.datasetId,
      jobId: reservation.jobId,
      roundingRecordId: secondSegment.id,
      patientId: patient.id,
      workDate: new Date('2026-08-19T00:00:00.000Z'),
      summary: 'Synthetic invalid extraction evidence',
    };
    await expect(
      prisma.taskExtractionEvidence.create({
        data: { ...extractionBase, sourceType: 'TIMELINE_EVENT' },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.taskExtractionEvidence.create({
        data: {
          ...extractionBase,
          sourceType: 'ROUNDING_SEGMENT',
          timelineEventId: timelineEvent.id,
        },
      }),
    ).rejects.toBeDefined();
    await prisma.taskExtractionEvidence.createMany({
      data: [
        {
          ...extractionBase,
          sourceType: 'TIMELINE_EVENT',
          timelineEventId: timelineEvent.id,
        },
        {
          ...extractionBase,
          sourceType: 'TASK',
          sourceTaskId: sourceTask.id,
        },
      ],
    });
    await expect(
      prisma.taskExtractionEvidence.create({
        data: {
          ...extractionBase,
          sourceType: 'TASK',
          timelineEventId: timelineEvent.id,
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.taskExtractionEvidence.create({
        data: {
          ...extractionBase,
          roundingRecordId: firstSegment.id,
          sourceType: 'ROUNDING_SEGMENT',
        },
      }),
    ).rejects.toBeDefined();

    expect(
      await prisma.taskEvidence.count({
        where: {
          datasetId: context.datasetId,
          taskId: task.id,
          sourceType: 'ROUNDING_SEGMENT',
          roundingSegmentId: firstSegment.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.taskExtractionEvidence.count({
        where: {
          datasetId: context.datasetId,
          jobId: reservation.jobId,
          roundingRecordId: firstSegment.id,
          sourceType: 'ROUNDING_SEGMENT',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.taskEvidence.count({
        where: { datasetId: context.datasetId, taskId: task.id },
      }),
    ).toBe(3);
    expect(
      await prisma.taskExtractionEvidence.count({
        where: { datasetId: context.datasetId, jobId: reservation.jobId },
      }),
    ).toBe(3);
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

    const requiredForeignKeys = await prisma.$queryRaw<
      Array<{
        constraintName: string;
        sourceTable: string;
        targetTable: string;
        sourceColumns: string[];
        targetColumns: string[];
      }>
    >`
      SELECT
        constraint_entry.conname::text AS "constraintName",
        source_table.relname::text AS "sourceTable",
        target_table.relname::text AS "targetTable",
        array_agg(source_attribute.attname::text ORDER BY key_entry.ordinality) AS "sourceColumns",
        array_agg(target_attribute.attname::text ORDER BY key_entry.ordinality) AS "targetColumns"
      FROM pg_constraint AS constraint_entry
      JOIN pg_class AS source_table
        ON source_table.oid = constraint_entry.conrelid
      JOIN pg_namespace AS source_namespace
        ON source_namespace.oid = source_table.relnamespace
      JOIN pg_class AS target_table
        ON target_table.oid = constraint_entry.confrelid
      CROSS JOIN LATERAL unnest(
        constraint_entry.conkey,
        constraint_entry.confkey
      ) WITH ORDINALITY AS key_entry(source_number, target_number, ordinality)
      JOIN pg_attribute AS source_attribute
        ON source_attribute.attrelid = source_table.oid
       AND source_attribute.attnum = key_entry.source_number
      JOIN pg_attribute AS target_attribute
        ON target_attribute.attrelid = target_table.oid
       AND target_attribute.attnum = key_entry.target_number
      WHERE source_namespace.nspname = current_schema()
        AND constraint_entry.conname IN (
          'Task_datasetId_actorId_wardId_fkey',
          'Task_datasetId_patientId_wardId_fkey',
          'TaskExtractionJob_datasetId_id_actorId_wardId_operation_fkey',
          'Handoff_datasetId_senderActorId_wardId_fkey',
          'Handoff_datasetId_receiverActorId_wardId_fkey',
          'HandoffFinalSnapshot_datasetId_handoffId_fkey'
        )
      GROUP BY constraint_entry.conname, source_table.relname, target_table.relname
    `;
    const foreignKeyByName = Object.fromEntries(
      requiredForeignKeys.map((foreignKey) => [
        foreignKey.constraintName,
        foreignKey,
      ]),
    );
    expect(foreignKeyByName).toMatchObject({
      Task_datasetId_actorId_wardId_fkey: {
        sourceTable: 'Task',
        targetTable: 'WardMembership',
        sourceColumns: ['datasetId', 'actorId', 'wardId'],
        targetColumns: ['datasetId', 'nurseId', 'wardId'],
      },
      Task_datasetId_patientId_wardId_fkey: {
        sourceTable: 'Task',
        targetTable: 'Patient',
        sourceColumns: ['datasetId', 'patientId', 'wardId'],
        targetColumns: ['datasetId', 'id', 'wardId'],
      },
      TaskExtractionJob_datasetId_id_actorId_wardId_operation_fkey: {
        sourceTable: 'TaskExtractionJob',
        targetTable: 'AiJob',
        sourceColumns: ['datasetId', 'id', 'actorId', 'wardId', 'operation'],
        targetColumns: ['datasetId', 'id', 'actorId', 'wardId', 'operation'],
      },
      Handoff_datasetId_senderActorId_wardId_fkey: {
        sourceTable: 'Handoff',
        targetTable: 'WardMembership',
        sourceColumns: ['datasetId', 'senderActorId', 'wardId'],
        targetColumns: ['datasetId', 'nurseId', 'wardId'],
      },
      Handoff_datasetId_receiverActorId_wardId_fkey: {
        sourceTable: 'Handoff',
        targetTable: 'WardMembership',
        sourceColumns: ['datasetId', 'receiverActorId', 'wardId'],
        targetColumns: ['datasetId', 'nurseId', 'wardId'],
      },
      HandoffFinalSnapshot_datasetId_handoffId_fkey: {
        sourceTable: 'HandoffFinalSnapshot',
        targetTable: 'Handoff',
        sourceColumns: ['datasetId', 'handoffId'],
        targetColumns: ['datasetId', 'id'],
      },
    });
    expect(Object.keys(foreignKeyByName)).toHaveLength(6);

    const evidenceChecks = await prisma.$queryRaw<
      Array<{ constraint_name: string; definition: string }>
    >`
      SELECT
        conname::text AS constraint_name,
        pg_get_constraintdef(oid)::text AS definition
      FROM pg_constraint
      WHERE connamespace = current_schema()::regnamespace
        AND conname IN (
          'TaskEvidence_source_shape_check',
          'TaskExtractionEvidence_source_shape_check'
        )
      ORDER BY conname
    `;
    expect(
      evidenceChecks.map(({ constraint_name }) => constraint_name),
    ).toEqual([
      'TaskEvidence_source_shape_check',
      'TaskExtractionEvidence_source_shape_check',
    ]);
    expect(
      evidenceChecks.every(({ definition }) =>
        definition.includes('ROUNDING_SEGMENT'),
      ),
    ).toBe(true);

    const evidenceUniqueIndexes = await prisma.$queryRaw<
      Array<{ index_name: string; definition: string }>
    >`
      SELECT indexname::text AS index_name, indexdef::text AS definition
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'TaskEvidence_timeline_source_key',
          'TaskEvidence_task_source_key',
          'TaskEvidence_rounding_segment_source_key',
          'TaskExtractionEvidence_timeline_source_key',
          'TaskExtractionEvidence_task_source_key',
          'TaskExtractionEvidence_rounding_segment_source_key'
        )
      ORDER BY indexname
    `;
    expect(evidenceUniqueIndexes).toHaveLength(6);
    expect(
      evidenceUniqueIndexes.every(({ definition }) =>
        definition.includes('UNIQUE INDEX'),
      ),
    ).toBe(true);
    expect(
      evidenceUniqueIndexes.every(({ definition }) =>
        definition.includes('WHERE'),
      ),
    ).toBe(true);
  });

  it('finalized snapshot은 dataset 수명 종료 cascade에서만 삭제된다', async () => {
    const lifecycle = await createFinalizedDatasetLifecycleFixture(prisma);
    expect(
      await prisma.handoffFinalSnapshot.count({
        where: { datasetId: lifecycle.datasetId },
      }),
    ).toBe(1);

    await expect(
      prisma.demoDataset.delete({ where: { id: lifecycle.datasetId } }),
    ).resolves.toMatchObject({ id: lifecycle.datasetId });

    expect(
      await prisma.handoffFinalSnapshot.count({
        where: { datasetId: lifecycle.datasetId },
      }),
    ).toBe(0);
    expect(
      await prisma.demoDataset.count({ where: { id: lifecycle.datasetId } }),
    ).toBe(0);
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

function findActivePatient(prisma: PrismaService, context: DemoSessionContext) {
  const now = new Date();
  return prisma.patient.findFirstOrThrow({
    where: {
      datasetId: context.datasetId,
      wardId: context.wardId,
      patientAssignments: {
        some: {
          nurseId: context.actorId,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
      },
    },
    orderBy: { id: 'asc' },
  });
}

async function reserveSyntheticExtraction(
  app: INestApplication,
  prisma: PrismaService,
  context: DemoSessionContext,
): Promise<{ jobId: string; segmentId: string }> {
  const patient = await findActivePatient(prisma, context);
  const now = new Date();
  const roundingSession = await prisma.roundingSession.create({
    data: {
      datasetId: context.datasetId,
      actorId: context.actorId,
      wardId: context.wardId,
      status: 'COMPLETED',
      startedAt: new Date(now.getTime() - 60_000),
      completedAt: now,
    },
  });
  const segment = await prisma.roundingPatientSegment.create({
    data: {
      datasetId: context.datasetId,
      roundingSessionId: roundingSession.id,
      patientId: patient.id,
      wardId: context.wardId,
      sequence: 1,
      startedAt: new Date(now.getTime() - 60_000),
      endedAt: now,
      note: 'Synthetic integration segment',
    },
  });
  const reservation = await app
    .get(TaskService)
    .reserveExtraction(
      context,
      `synthetic-extraction-${randomUUID()}`,
      randomUUID(),
      { roundingSessionId: roundingSession.id, recordIds: [segment.id] },
    );
  return { jobId: reservation.jobId, segmentId: segment.id };
}

async function publishSyntheticExtraction(
  app: INestApplication,
  prisma: PrismaService,
  dispatcher: TaskHandoffJobDispatcher,
  context: DemoSessionContext,
): Promise<{ jobId: string; candidateId: string }> {
  const fixture = await reserveSyntheticExtraction(app, prisma, context);
  await dispatcher.runOnce();
  const job = await prisma.aiJob.findUniqueOrThrow({
    where: { id: fixture.jobId },
  });
  if (job.status !== 'SUCCEEDED') {
    throw new Error('Task extraction publish가 완료되지 않았습니다.');
  }
  const candidate = await prisma.taskExtractionCandidate.findFirstOrThrow({
    where: { datasetId: context.datasetId, jobId: fixture.jobId },
    orderBy: { id: 'asc' },
  });
  return { jobId: fixture.jobId, candidateId: candidate.id };
}

async function createFinalizedDatasetLifecycleFixture(
  prisma: PrismaService,
): Promise<{ datasetId: string }> {
  const now = new Date();
  const dataset = await prisma.demoDataset.create({
    data: { scenarioKey: `SNAPSHOT_LIFECYCLE_${randomUUID()}` },
  });
  const ward = await prisma.ward.create({
    data: {
      datasetId: dataset.id,
      logicalKey: 'lifecycle-ward',
      code: 'LIFECYCLE',
      displayName: 'Synthetic lifecycle ward',
    },
  });
  const [sender, receiver] = await Promise.all([
    prisma.nurse.create({
      data: {
        datasetId: dataset.id,
        logicalKey: 'lifecycle-sender',
        displayName: 'Synthetic lifecycle sender',
      },
    }),
    prisma.nurse.create({
      data: {
        datasetId: dataset.id,
        logicalKey: 'lifecycle-receiver',
        displayName: 'Synthetic lifecycle receiver',
      },
    }),
  ]);
  await prisma.wardMembership.createMany({
    data: [
      {
        datasetId: dataset.id,
        logicalKey: 'lifecycle-sender-membership',
        nurseId: sender.id,
        wardId: ward.id,
        role: 'SENDER',
      },
      {
        datasetId: dataset.id,
        logicalKey: 'lifecycle-receiver-membership',
        nurseId: receiver.id,
        wardId: ward.id,
        role: 'RECEIVER',
      },
    ],
  });
  const [senderShift, receiverShift] = await Promise.all([
    prisma.nurseShift.create({
      data: {
        datasetId: dataset.id,
        logicalKey: 'lifecycle-sender-shift',
        nurseId: sender.id,
        wardId: ward.id,
        duty: 'DAY',
        startsAt: new Date(now.getTime() - 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 7 * 60 * 60 * 1000),
      },
    }),
    prisma.nurseShift.create({
      data: {
        datasetId: dataset.id,
        logicalKey: 'lifecycle-receiver-shift',
        nurseId: receiver.id,
        wardId: ward.id,
        duty: 'EVENING',
        startsAt: new Date(now.getTime() + 7 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 15 * 60 * 60 * 1000),
      },
    }),
  ]);
  const precheckRecord = await prisma.idempotencyRecord.create({
    data: {
      datasetId: dataset.id,
      actorId: sender.id,
      wardId: ward.id,
      operation: 'handoffs.precheck',
      idempotencyKey: `lifecycle-precheck-${randomUUID()}`,
      requestHash: '1'.repeat(64),
    },
  });
  const precheckJob = await prisma.aiJob.create({
    data: {
      datasetId: dataset.id,
      actorId: sender.id,
      wardId: ward.id,
      operation: 'handoffs.precheck',
      idempotencyRecordId: precheckRecord.id,
      requestId: randomUUID(),
      maxAttempts: 3,
    },
  });
  const precheck = await prisma.handoffPrecheck.create({
    data: {
      datasetId: dataset.id,
      wardId: ward.id,
      senderActorId: sender.id,
      receiverActorId: receiver.id,
      senderShiftId: senderShift.id,
      receiverShiftId: receiverShift.id,
      handoffDate: new Date('2026-08-19T00:00:00.000Z'),
      targetDuty: 'EVENING',
      aiJobId: precheckJob.id,
      idempotencyRecordId: precheckRecord.id,
      requestHash: '1'.repeat(64),
      requestId: randomUUID(),
    },
  });
  const handoff = await prisma.handoff.create({
    data: {
      datasetId: dataset.id,
      wardId: ward.id,
      senderActorId: sender.id,
      receiverActorId: receiver.id,
      senderShiftId: senderShift.id,
      receiverShiftId: receiverShift.id,
      handoffDate: new Date('2026-08-19T00:00:00.000Z'),
      targetDuty: 'EVENING',
      status: 'FINALIZED',
      precheckId: precheck.id,
      precheckVersion: 1,
      templateKey: 'NURSING_HANDOFF_V1',
      includeUnverified: false,
      frozenInputPayload: { synthetic: true },
      frozenInputHash: '2'.repeat(64),
      finalizedAt: now,
    },
  });
  const finalRecord = await prisma.idempotencyRecord.create({
    data: {
      datasetId: dataset.id,
      actorId: sender.id,
      wardId: ward.id,
      operation: 'handoffs.finalize',
      idempotencyKey: `lifecycle-finalize-${randomUUID()}`,
      requestHash: '3'.repeat(64),
    },
  });
  await prisma.handoffFinalSnapshot.create({
    data: {
      datasetId: dataset.id,
      wardId: ward.id,
      handoffId: handoff.id,
      senderActorId: sender.id,
      receiverActorId: receiver.id,
      finalizedByActorId: sender.id,
      resolution: 'RESOLVED',
      sourceDraftVersion: 1,
      precheckVersion: 1,
      templateKey: 'NURSING_HANDOFF_V1',
      includeUnverified: false,
      idempotencyRecordId: finalRecord.id,
      requestHash: '3'.repeat(64),
      snapshotPayload: { synthetic: true },
      snapshotHash: '4'.repeat(64),
      finalizedAt: now,
    },
  });
  return { datasetId: dataset.id };
}
