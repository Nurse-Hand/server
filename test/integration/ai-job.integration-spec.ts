import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap/configure-application';
import { createCanonicalRequestHash } from '../../src/common/idempotency/canonical-request-hash';
import { Clock } from '../../src/common/time/clock';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AiJobService } from '../../src/modules/ai-jobs/application/ai-job.service';
import { IdempotentAiJobService } from '../../src/modules/ai-jobs/application/idempotent-ai-job.service';
import type { ReserveAiJobInput } from '../../src/modules/ai-jobs/application/ports/ai-job.repository';
import { PrismaAiJobRepository } from '../../src/modules/ai-jobs/infrastructure/prisma-ai-job.repository';
import type { DemoSessionContext } from '../../src/modules/demo/application/demo-session-context';
import { DemoSessionContextResolver } from '../../src/modules/demo/application/demo-session-context.resolver';
import { DemoSessionService } from '../../src/modules/demo/application/demo-session.service';

class MutableClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

describe('AI Job and idempotency PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let context: DemoSessionContext;
  let secondContext: DemoSessionContext;
  let idempotentJobs: IdempotentAiJobService;
  let aiJobs: AiJobService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    idempotentJobs = app.get(IdempotentAiJobService);
    aiJobs = app.get(AiJobService);

    const created = await app
      .get(DemoSessionService)
      .create('SYNTHETIC_MEDICAL_DAY_SHIFT');
    context = await app
      .get(DemoSessionContextResolver)
      .resolve(readPersonaSessionId(created, 'SENDER'));
    const secondCreated = await app
      .get(DemoSessionService)
      .create('SYNTHETIC_MEDICAL_DAY_SHIFT');
    secondContext = await app
      .get(DemoSessionContextResolver)
      .resolve(readPersonaSessionId(secondCreated, 'SENDER'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('같은 idempotency key 동시 요청은 reservation과 Job을 각각 하나만 만든다', async () => {
    const input = createReservationInput(context);
    const results = await Promise.allSettled([
      idempotentJobs.reserve(input),
      idempotentJobs.reserve(input),
    ]);
    const fulfilled = results.filter(({ status }) => status === 'fulfilled');
    const rejected = results.filter(({ status }) => status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    });
    await expect(
      idempotentJobs.reserve({ ...input, requestHash: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    expect(
      await prisma.aiJob.count({
        where: { datasetId: context.datasetId, operation: input.operation },
      }),
    ).toBe(1);
    expect(
      await prisma.idempotencyRecord.count({
        where: {
          datasetId: context.datasetId,
          actorId: context.actorId,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
        },
      }),
    ).toBe(1);
  });

  it('한 공통 idempotency record에는 AiJob을 하나만 연결한다', async () => {
    const input = createReservationInput(context);
    const reserved = await idempotentJobs.reserve(input);
    const job = await prisma.aiJob.findUniqueOrThrow({
      where: { id: reserved.jobId },
      select: { idempotencyRecordId: true },
    });

    await expect(
      prisma.aiJob.create({
        data: {
          datasetId: input.datasetId,
          actorId: input.actorId,
          wardId: input.wardId,
          operation: input.operation,
          idempotencyRecordId: job.idempotencyRecordId,
          requestId: randomUUID(),
          maxAttempts: 3,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.aiJob.count({
        where: { idempotencyRecordId: job.idempotencyRecordId },
      }),
    ).resolves.toBe(1);
  });

  it('공통 idempotency record는 AiJob 없이도 존재할 수 있다', async () => {
    const record = await prisma.idempotencyRecord.create({
      data: {
        datasetId: context.datasetId,
        actorId: context.actorId,
        wardId: context.wardId,
        operation: createOperation(),
        idempotencyKey: `generic-${randomUUID()}`,
        requestHash: 'a'.repeat(64),
      },
      include: { aiJob: true },
    });

    expect(record.aiJob).toBeNull();
  });

  it('AiJob과 공통 record의 dataset/actor/ward/operation scope 불일치를 FK가 거부한다', async () => {
    const operation = createOperation();
    const record = await prisma.idempotencyRecord.create({
      data: {
        datasetId: context.datasetId,
        actorId: context.actorId,
        wardId: context.wardId,
        operation,
        idempotencyKey: `scope-${randomUUID()}`,
        requestHash: 'a'.repeat(64),
      },
      select: { id: true },
    });

    await expect(
      prisma.aiJob.create({
        data: {
          datasetId: context.datasetId,
          actorId: context.actorId,
          wardId: context.wardId,
          operation: `${operation}.different`,
          idempotencyRecordId: record.id,
          requestId: randomUUID(),
          maxAttempts: 3,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('AiJob idempotency relation의 FK 열과 단일 record unique를 DB catalog로 고정한다', async () => {
    const foreignKeys = await prisma.$queryRaw<
      Array<{
        constraintName: string;
        sourceColumns: string[];
        targetColumns: string[];
      }>
    >`
      SELECT
        constraint_entry.conname AS "constraintName",
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
        AND constraint_entry.conname = 'AiJob_idempotency_scope_fkey'
      GROUP BY constraint_entry.conname
    `;
    const uniqueIndexes = await prisma.$queryRaw<
      Array<{ indexName: string; isUnique: boolean; columns: string[] }>
    >`
      SELECT
        index_entry.relname AS "indexName",
        index_metadata.indisunique AS "isUnique",
        array_agg(attribute_entry.attname::text ORDER BY key_entry.ordinality) AS "columns"
      FROM pg_index AS index_metadata
      JOIN pg_class AS table_entry
        ON table_entry.oid = index_metadata.indrelid
      JOIN pg_namespace AS table_namespace
        ON table_namespace.oid = table_entry.relnamespace
      JOIN pg_class AS index_entry
        ON index_entry.oid = index_metadata.indexrelid
      CROSS JOIN LATERAL unnest(index_metadata.indkey)
        WITH ORDINALITY AS key_entry(attribute_number, ordinality)
      JOIN pg_attribute AS attribute_entry
        ON attribute_entry.attrelid = table_entry.oid
       AND attribute_entry.attnum = key_entry.attribute_number
      WHERE table_namespace.nspname = current_schema()
        AND table_entry.relname = 'AiJob'
        AND index_entry.relname = 'AiJob_idempotency_record_id_key'
      GROUP BY index_entry.relname, index_metadata.indisunique
    `;

    expect(foreignKeys).toEqual([
      {
        constraintName: 'AiJob_idempotency_scope_fkey',
        sourceColumns: [
          'datasetId',
          'idempotencyRecordId',
          'actorId',
          'wardId',
          'operation',
        ],
        targetColumns: ['datasetId', 'id', 'actorId', 'wardId', 'operation'],
      },
    ]);
    expect(uniqueIndexes).toEqual([
      {
        indexName: 'AiJob_idempotency_record_id_key',
        isUnique: true,
        columns: ['idempotencyRecordId'],
      },
    ]);
  });

  it('idempotencyRecordId 없는 orphan AiJob raw insert를 DB가 거부한다', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "AiJob" (
          "id", "datasetId", "actorId", "wardId", "operation",
          "requestId", "maxAttempts", "updatedAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${context.datasetId}::uuid,
          ${context.actorId}::uuid,
          ${context.wardId}::uuid,
          ${createOperation()},
          ${randomUUID()}::uuid,
          3,
          ${new Date()}
        )
      `,
    ).rejects.toBeDefined();
  });

  it('terminal Job도 유효한 lease 시간 순서를 DB constraint로 강제한다', async () => {
    const claimedAt = new Date();
    const input = createReservationInput(context);
    const reserved = await idempotentJobs.reserve(input);
    const original = await prisma.aiJob.findUniqueOrThrow({
      where: { id: reserved.jobId },
    });

    await expect(
      prisma.aiJob.update({
        where: { id: reserved.jobId },
        data: {
          status: 'SUCCEEDED',
          attempt: 1,
          claimedAt,
          leaseExpiresAt: new Date(claimedAt.getTime() - 1),
          leaseVersion: 1,
          resultReference: 'timeline:invalid-lease-order',
        },
      }),
    ).rejects.toBeDefined();

    const persisted = await prisma.aiJob.findUniqueOrThrow({
      where: { id: reserved.jobId },
    });
    expect(persisted).toEqual(original);
    expect(persisted).toMatchObject({
      status: 'QUEUED',
      attempt: 0,
      claimedAt: null,
      leaseExpiresAt: null,
      leaseVersion: 0,
      failureCode: null,
      retryable: null,
      resultReference: null,
      version: 1,
    });
  });

  it('동시 claim은 한 worker만 얻고 terminal 후 같은 요청은 기존 job을 반환한다', async () => {
    const input = createReservationInput(context);
    const reserved = await idempotentJobs.reserve(input);
    const claimInput = {
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: input.operation,
      leaseMilliseconds: 60_000,
    };
    const claims = await Promise.all([
      aiJobs.claimNext(claimInput),
      aiJobs.claimNext(claimInput),
    ]);
    const acquired = claims.filter((claim) => claim !== null);

    expect(acquired).toHaveLength(1);
    expect(acquired[0]?.jobId).toBe(reserved.jobId);

    await aiJobs.complete({
      datasetId: context.datasetId,
      jobId: reserved.jobId,
      leaseVersion: acquired[0]!.leaseVersion,
      resultReference: 'timeline:synthetic-result',
    });

    await expect(idempotentJobs.reserve(input)).resolves.toEqual({
      jobId: reserved.jobId,
      isReplay: true,
    });
    await expect(
      aiJobs.fail({
        datasetId: context.datasetId,
        jobId: reserved.jobId,
        leaseVersion: acquired[0]!.leaseVersion,
        failureCode: 'SYNTHETIC_FAILURE',
        retryable: false,
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_CLAIM_LOST' });
  });

  it('DB trigger가 terminal AiJob의 CHECK상 유효한 직접 UPDATE도 거부한다', async () => {
    const input = createReservationInput(context);
    const reserved = await idempotentJobs.reserve(input);
    const claim = await aiJobs.claimNext({
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: input.operation,
      leaseMilliseconds: 60_000,
    });

    await aiJobs.complete({
      datasetId: context.datasetId,
      jobId: reserved.jobId,
      leaseVersion: claim!.leaseVersion,
      resultReference: 'timeline:terminal-original',
    });
    await expect(
      prisma.aiJob.update({
        where: { id: reserved.jobId },
        data: { resultReference: 'timeline:terminal-tampered' },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: reserved.jobId } }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      resultReference: 'timeline:terminal-original',
    });
  });

  it('DB trigger가 FAILED AiJob의 CHECK상 유효한 직접 UPDATE도 거부한다', async () => {
    const input = createReservationInput(context);
    const reserved = await idempotentJobs.reserve(input);
    const claim = await aiJobs.claimNext({
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: input.operation,
      leaseMilliseconds: 60_000,
    });

    await aiJobs.fail({
      datasetId: context.datasetId,
      jobId: reserved.jobId,
      leaseVersion: claim!.leaseVersion,
      failureCode: 'ORIGINAL_FAILURE',
      retryable: false,
    });
    await expect(
      prisma.aiJob.update({
        where: { id: reserved.jobId },
        data: { failureCode: 'TAMPERED_FAILURE' },
      }),
    ).rejects.toBeDefined();
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: reserved.jobId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'ORIGINAL_FAILURE',
    });
  });

  it('lease 만료 후 직접 재claim하며 stale worker의 complete와 fail을 fencing한다', async () => {
    const repository = new PrismaAiJobRepository(prisma);
    const clock = new MutableClock(new Date());
    const idempotentService = new IdempotentAiJobService(repository);
    const jobService = new AiJobService(repository, clock);
    const input = createReservationInput(context, { maxAttempts: 3 });
    const reserved = await idempotentService.reserve(input);
    const claimInput = {
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: input.operation,
      leaseMilliseconds: 1000,
    };
    const firstClaim = await jobService.claimNext(claimInput);

    expect(firstClaim).not.toBeNull();
    clock.advance(1001);
    await expect(
      jobService.complete({
        datasetId: context.datasetId,
        jobId: reserved.jobId,
        leaseVersion: firstClaim!.leaseVersion,
        resultReference: 'timeline:stale-before-reclaim',
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_CLAIM_LOST' });

    const secondClaim = await jobService.claimNext(claimInput);
    expect(secondClaim).toMatchObject({
      jobId: reserved.jobId,
      attempt: 2,
      leaseVersion: firstClaim!.leaseVersion + 1,
    });
    await expect(
      jobService.fail({
        datasetId: context.datasetId,
        jobId: reserved.jobId,
        leaseVersion: firstClaim!.leaseVersion,
        failureCode: 'STALE_WORKER',
        retryable: true,
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_CLAIM_LOST' });

    await jobService.complete({
      datasetId: context.datasetId,
      jobId: reserved.jobId,
      leaseVersion: secondClaim!.leaseVersion,
      resultReference: 'timeline:fresh-worker-result',
    });
    await expect(jobService.claimNext(claimInput)).resolves.toBeNull();
  });

  it('maxAttempts가 소진된 lease를 FAILED와 idempotency COMPLETED로 함께 종결한다', async () => {
    const repository = new PrismaAiJobRepository(prisma);
    const clock = new MutableClock(new Date());
    const idempotentService = new IdempotentAiJobService(repository);
    const jobService = new AiJobService(repository, clock);
    const input = createReservationInput(context, { maxAttempts: 1 });
    const reserved = await idempotentService.reserve(input);
    const claimInput = {
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: input.operation,
      leaseMilliseconds: 1000,
    };

    await expect(jobService.claimNext(claimInput)).resolves.not.toBeNull();
    clock.advance(1001);
    await expect(jobService.claimNext(claimInput)).resolves.toBeNull();

    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: reserved.jobId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      attempt: 1,
      failureCode: 'AI_JOB_MAX_ATTEMPTS_EXCEEDED',
      retryable: false,
    });
    await expect(
      prisma.idempotencyRecord.findFirstOrThrow({
        where: { aiJob: { is: { id: reserved.jobId } } },
      }),
    ).resolves.toMatchObject({
      status: 'COMPLETED',
      resultReference: reserved.jobId,
    });
    await expect(idempotentService.reserve(input)).resolves.toEqual({
      jobId: reserved.jobId,
      isReplay: true,
    });
  });

  it('Job FK 실패 시 같은 transaction의 idempotency reservation도 남기지 않는다', async () => {
    const input = createReservationInput({
      ...context,
      wardId: '30000000-0000-4000-8000-000000000999',
    });

    await expect(idempotentJobs.reserve(input)).rejects.toMatchObject({
      code: 'AI_JOB_SCOPE_INVALID',
      kind: 'NOT_FOUND',
    });
    expect(
      await prisma.aiJob.count({
        where: { datasetId: context.datasetId, operation: input.operation },
      }),
    ).toBe(0);
    expect(
      await prisma.idempotencyRecord.count({
        where: {
          datasetId: context.datasetId,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
        },
      }),
    ).toBe(0);
  });

  it('finish에서 연결 record가 PROCESSING이 아니면 AiJob 변경을 rollback한다', async () => {
    const repository = new PrismaAiJobRepository(prisma);
    const clock = new MutableClock(new Date());
    const jobService = new AiJobService(repository, clock);
    const input = createReservationInput(context, { maxAttempts: 2 });
    const reserved = await idempotentJobs.reserve(input);
    const claim = await jobService.claimNext({
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: input.operation,
      leaseMilliseconds: 1000,
    });
    const job = await prisma.aiJob.findUniqueOrThrow({
      where: { id: reserved.jobId },
      select: { idempotencyRecordId: true },
    });
    await prisma.idempotencyRecord.update({
      where: { id: job.idempotencyRecordId },
      data: { status: 'COMPLETED', resultReference: reserved.jobId },
    });

    await expect(
      jobService.complete({
        datasetId: context.datasetId,
        jobId: reserved.jobId,
        leaseVersion: claim!.leaseVersion,
        resultReference: 'timeline:status-mismatch-result',
      }),
    ).rejects.toMatchObject({
      code: 'AI_JOB_INVARIANT_VIOLATION',
      kind: 'INTERNAL_ERROR',
    });
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: reserved.jobId } }),
    ).resolves.toMatchObject({ status: 'PROCESSING' });
  });

  it('max-attempt 자동 종결도 연결 record 상태가 다르면 전부 rollback한다', async () => {
    const repository = new PrismaAiJobRepository(prisma);
    const clock = new MutableClock(new Date());
    const jobService = new AiJobService(repository, clock);
    const input = createReservationInput(context, { maxAttempts: 1 });
    const reserved = await idempotentJobs.reserve(input);
    const claimInput = {
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: input.operation,
      leaseMilliseconds: 1000,
    };

    await expect(jobService.claimNext(claimInput)).resolves.not.toBeNull();
    const job = await prisma.aiJob.findUniqueOrThrow({
      where: { id: reserved.jobId },
      select: { idempotencyRecordId: true },
    });
    await prisma.idempotencyRecord.update({
      where: { id: job.idempotencyRecordId },
      data: { status: 'COMPLETED', resultReference: reserved.jobId },
    });
    clock.advance(1001);
    await expect(jobService.claimNext(claimInput)).rejects.toMatchObject({
      code: 'AI_JOB_INVARIANT_VIOLATION',
    });
    await expect(
      prisma.aiJob.findUniqueOrThrow({ where: { id: reserved.jobId } }),
    ).resolves.toMatchObject({
      status: 'PROCESSING',
      attempt: 1,
    });
  });

  it('동일 key는 actor, operation, dataset scope가 다르면 각각 독립적으로 예약된다', async () => {
    const sharedKey = `shared-${randomUUID()}`;
    const sharedOperation = createOperation();
    const first = createReservationInput(context, {
      idempotencyKey: sharedKey,
      operation: sharedOperation,
    });
    const differentOperation = {
      ...first,
      operation: createOperation(),
      requestId: randomUUID(),
    };
    const receiver = await prisma.nurse.findFirstOrThrow({
      where: {
        datasetId: context.datasetId,
        logicalKey: 'nurse-receiver-a',
        wardMemberships: { some: { wardId: context.wardId } },
      },
      select: { id: true },
    });
    const differentActor = createReservationInput(context, {
      actorId: receiver.id,
      idempotencyKey: sharedKey,
      operation: sharedOperation,
    });
    const differentDataset = createReservationInput(secondContext, {
      idempotencyKey: sharedKey,
      operation: sharedOperation,
    });

    await expect(idempotentJobs.reserve(first)).resolves.toMatchObject({
      isReplay: false,
    });
    await expect(
      idempotentJobs.reserve(differentOperation),
    ).resolves.toMatchObject({ isReplay: false });
    await expect(idempotentJobs.reserve(differentActor)).resolves.toMatchObject(
      { isReplay: false },
    );
    await expect(
      idempotentJobs.reserve(differentDataset),
    ).resolves.toMatchObject({ isReplay: false });
  });

  it('session별 dataset scope가 다른 session의 Job claim과 finish를 차단한다', async () => {
    const firstOperation = createOperation();
    const secondOperation = createOperation();
    const firstInput = createReservationInput(context, {
      operation: firstOperation,
    });
    const secondInput = createReservationInput(secondContext, {
      operation: secondOperation,
    });
    const [first, second] = await Promise.all([
      idempotentJobs.reserve(firstInput),
      idempotentJobs.reserve(secondInput),
    ]);

    await expect(
      aiJobs.claimNext({
        datasetId: context.datasetId,
        wardId: context.wardId,
        operation: secondOperation,
        leaseMilliseconds: 60_000,
      }),
    ).resolves.toBeNull();
    const secondClaim = await aiJobs.claimNext({
      datasetId: secondContext.datasetId,
      wardId: secondContext.wardId,
      operation: secondOperation,
      leaseMilliseconds: 60_000,
    });
    await expect(
      aiJobs.claimNext({
        datasetId: secondContext.datasetId,
        wardId: secondContext.wardId,
        operation: firstOperation,
        leaseMilliseconds: 60_000,
      }),
    ).resolves.toBeNull();
    const firstClaim = await aiJobs.claimNext({
      datasetId: context.datasetId,
      wardId: context.wardId,
      operation: firstOperation,
      leaseMilliseconds: 60_000,
    });

    expect(firstClaim?.jobId).toBe(first.jobId);
    expect(secondClaim?.jobId).toBe(second.jobId);
    await expect(
      aiJobs.complete({
        datasetId: context.datasetId,
        jobId: second.jobId,
        leaseVersion: secondClaim!.leaseVersion,
        resultReference: 'timeline:cross-session-blocked-a',
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_CLAIM_LOST' });
    await expect(
      aiJobs.complete({
        datasetId: secondContext.datasetId,
        jobId: first.jobId,
        leaseVersion: firstClaim!.leaseVersion,
        resultReference: 'timeline:cross-session-blocked-b',
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_CLAIM_LOST' });

    await aiJobs.complete({
      datasetId: context.datasetId,
      jobId: first.jobId,
      leaseVersion: firstClaim!.leaseVersion,
      resultReference: 'timeline:first-session-result',
    });
    await aiJobs.complete({
      datasetId: secondContext.datasetId,
      jobId: second.jobId,
      leaseVersion: secondClaim!.leaseVersion,
      resultReference: 'timeline:second-session-result',
    });
  });
});

function createReservationInput(
  context: DemoSessionContext,
  overrides: Partial<ReserveAiJobInput> = {},
): ReserveAiJobInput {
  const operation = overrides.operation ?? createOperation();

  return {
    datasetId: context.datasetId,
    actorId: context.actorId,
    wardId: context.wardId,
    operation,
    idempotencyKey: `key-${randomUUID()}`,
    requestHash: createCanonicalRequestHash({
      path: {},
      query: {},
      body: { operation, syntheticInput: 'value' },
    }),
    requestId: randomUUID(),
    maxAttempts: 3,
    ...overrides,
  };
}

function createOperation(): string {
  return `test.${randomUUID().replaceAll('-', '')}`;
}

function readPersonaSessionId(
  created: Awaited<ReturnType<DemoSessionService['create']>>,
  persona: 'SENDER' | 'RECEIVER',
): string {
  const credential = created.sessions.find(
    (session) => session.persona === persona,
  );

  if (!credential) {
    throw new Error(`${persona} demo session이 없습니다.`);
  }

  return credential.sessionId;
}
