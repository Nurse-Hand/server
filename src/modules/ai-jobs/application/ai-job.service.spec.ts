import { Clock } from '../../../common/time/clock';
import { AiJobService } from './ai-job.service';
import { IdempotentAiJobService } from './idempotent-ai-job.service';
import type { AiJobRepository } from './ports/ai-job.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const JOB_ID = '00000000-0000-4000-8000-000000000601';
const REQUEST_ID = '00000000-0000-4000-8000-000000000701';

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-08-18T00:00:00.000Z');
  }
}

function createRepository(): jest.Mocked<AiJobRepository> {
  return {
    reserve: jest.fn().mockResolvedValue({ kind: 'CREATED', jobId: JOB_ID }),
    claimNext: jest.fn().mockResolvedValue(null),
    complete: jest.fn().mockResolvedValue(true),
    fail: jest.fn().mockResolvedValue(true),
  };
}

describe('AI Job application validation', () => {
  it.each([
    { field: 'maxAttempts', value: 0 },
    { field: 'maxAttempts', value: 11 },
    { field: 'operation', value: '' },
    { field: 'idempotencyKey', value: ' ' },
    { field: 'idempotencyKey', value: undefined },
    { field: 'idempotencyKey', value: 42 },
    { field: 'requestId', value: 'not-a-uuid' },
    { field: 'requestHash', value: 'not-a-sha-256' },
  ])(
    'reserve의 잘못된 $field 값을 DB 호출 전에 거부한다',
    async ({ field, value }) => {
      const repository = createRepository();
      const service = new IdempotentAiJobService(repository);
      const input = {
        datasetId: DATASET_ID,
        actorId: ACTOR_ID,
        wardId: WARD_ID,
        operation: 'tasks.extract',
        idempotencyKey: 'synthetic-key-1',
        requestHash: 'a'.repeat(64),
        requestId: REQUEST_ID,
        maxAttempts: 3,
        [field]: value,
      };

      await expect(service.reserve(input)).rejects.toMatchObject({
        code: 'AI_JOB_COMMAND_INVALID',
        kind: 'BAD_REQUEST',
      });
      expect(repository.reserve).not.toHaveBeenCalled();
    },
  );

  it('claim의 operation과 lease 범위를 DB 호출 전에 검증한다', () => {
    const repository = createRepository();
    const service = new AiJobService(repository, new FixedClock());

    expect(() =>
      service.claimNext({
        datasetId: DATASET_ID,
        wardId: WARD_ID,
        operation: '',
        leaseMilliseconds: 60_000,
      }),
    ).toThrow('AI_JOB_COMMAND_INVALID');
    expect(() =>
      service.claimNext({
        datasetId: DATASET_ID,
        wardId: WARD_ID,
        operation: 'tasks.extract',
        leaseMilliseconds: 0,
      }),
    ).toThrow('AI_JOB_COMMAND_INVALID');
    expect(repository.claimNext).not.toHaveBeenCalled();
  });

  it('같은 idempotency scope가 다른 ward에서 재사용되면 key reuse로 거부한다', async () => {
    const repository = createRepository();
    repository.reserve.mockResolvedValue({
      kind: 'EXISTING',
      jobId: JOB_ID,
      wardId: '00000000-0000-4000-8000-000000000302',
      requestHash: 'a'.repeat(64),
      status: 'COMPLETED',
      resultReference: JOB_ID,
    });
    const service = new IdempotentAiJobService(repository);

    await expect(
      service.reserve({
        datasetId: DATASET_ID,
        actorId: ACTOR_ID,
        wardId: WARD_ID,
        operation: 'tasks.extract',
        idempotencyKey: 'synthetic-key-1',
        requestHash: 'a'.repeat(64),
        requestId: REQUEST_ID,
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('AiJob이 연결되지 않은 공통 완료 record를 Job replay로 오인하지 않는다', async () => {
    const repository = createRepository();
    repository.reserve.mockResolvedValue({
      kind: 'EXISTING',
      jobId: null,
      wardId: WARD_ID,
      requestHash: 'a'.repeat(64),
      status: 'COMPLETED',
      resultReference: 'task:generic-result',
    });
    const service = new IdempotentAiJobService(repository);

    await expect(
      service.reserve({
        datasetId: DATASET_ID,
        actorId: ACTOR_ID,
        wardId: WARD_ID,
        operation: 'tasks.extract',
        idempotencyKey: 'synthetic-key-1',
        requestHash: 'a'.repeat(64),
        requestId: REQUEST_ID,
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_INVARIANT_VIOLATION' });
  });

  it('complete의 leaseVersion과 resultReference를 검증한다', async () => {
    const repository = createRepository();
    const service = new AiJobService(repository, new FixedClock());

    await expect(
      service.complete({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: 0,
        resultReference: 'timeline:synthetic-result',
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_COMMAND_INVALID' });
    await expect(
      service.complete({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: 1,
        resultReference: '',
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_COMMAND_INVALID' });
    await expect(
      service.complete({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: 2_147_483_648,
        resultReference: 'timeline:synthetic-result',
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_COMMAND_INVALID' });
    await expect(
      service.complete({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: 1,
        resultReference: undefined as unknown as string,
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_COMMAND_INVALID' });
    await expect(
      service.complete({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: 1,
        resultReference: 'timeline:\u0000invalid',
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_COMMAND_INVALID' });
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it('fail의 failureCode와 retryable을 DB 호출 전에 검증한다', async () => {
    const repository = createRepository();
    const service = new AiJobService(repository, new FixedClock());

    await expect(
      service.fail({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: 1,
        failureCode: 'invalid-code',
        retryable: false,
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_COMMAND_INVALID' });
    await expect(
      service.fail({
        datasetId: DATASET_ID,
        jobId: JOB_ID,
        leaseVersion: 1,
        failureCode: 'SYNTHETIC_FAILURE',
        retryable: 'yes' as unknown as boolean,
      }),
    ).rejects.toMatchObject({ code: 'AI_JOB_COMMAND_INVALID' });
    expect(repository.fail).not.toHaveBeenCalled();
  });
});
