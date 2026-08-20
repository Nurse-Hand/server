import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PrismaHandoffPrecheckRepository } from './prisma-handoff-precheck.repository';

const DATASET_ID = '00000000-0000-4000-8000-000000000101';
const ACTOR_ID = '00000000-0000-4000-8000-000000000201';
const WARD_ID = '00000000-0000-4000-8000-000000000301';
const PRECHECK_ID = '00000000-0000-4000-8000-000000000401';
const ITEM_ID = '00000000-0000-4000-8000-000000000501';
const EVENT_ID = '00000000-0000-4000-8000-000000000601';
const TASK_ID = '00000000-0000-4000-8000-000000000602';
const JOB_ID = '00000000-0000-4000-8000-000000000701';
const NOW = new Date('2026-08-18T02:00:00.000Z');
const CONTEXT = { datasetId: DATASET_ID, actorId: ACTOR_ID, wardId: WARD_ID };

describe('PrismaHandoffPrecheckRepository', () => {
  it('상세를 고정 2 queries로 읽고 snapshot excerpt를 projection한다', async () => {
    const findPrecheck = jest.fn().mockResolvedValue({
      id: PRECHECK_ID,
      version: 2,
      aiJobId: JOB_ID,
      aiModelVersion: 'model-v1',
      aiContractVersion: 'handoff-precheck-v1',
      aiGeneratedAt: NOW,
      items: [
        {
          id: ITEM_ID,
          severity: 'CRITICAL',
          aiQuestion: '현재 체온을 확인해 주세요.',
          aiReason: '관찰 기록과 미완료 업무가 있습니다.',
          version: 1,
          answer: null,
          evidence: [
            {
              sourceType: 'TIMELINE_EVENT',
              timelineInput: {
                timelineEventId: EVENT_ID,
                patientId: ACTOR_ID,
                sourceReference: 'timeline:event:601',
                occurredAt: NOW,
                summary: '체온 상승 관찰',
              },
              taskInput: null,
            },
            {
              sourceType: 'TASK',
              timelineInput: null,
              taskInput: {
                taskId: TASK_ID,
                patientId: ACTOR_ID,
                title: '해열 후 체온 재측정',
                sourceReferences: [{ reference: 'task:602' }],
              },
            },
          ],
        },
      ],
    });
    const findJob = jest.fn().mockResolvedValue({
      id: JOB_ID,
      status: 'SUCCEEDED',
      failureCode: null,
      retryable: null,
    });
    const repository = new PrismaHandoffPrecheckRepository({
      handoffPrecheck: { findFirst: findPrecheck },
      aiJob: { findFirst: findJob },
    } as unknown as PrismaService);

    const result = await repository.get(CONTEXT, PRECHECK_ID);

    expect(findPrecheck).toHaveBeenCalledTimes(1);
    expect(findJob).toHaveBeenCalledTimes(1);
    expect(result.items[0].evidence).toEqual([
      {
        sourceType: 'TIMELINE_EVENT',
        sourceId: EVENT_ID,
        sourceReference: 'timeline:event:601',
        occurredAt: NOW,
        excerptKind: 'SUMMARY',
        excerpt: '체온 상승 관찰',
      },
      {
        sourceType: 'TASK',
        sourceId: TASK_ID,
        sourceReference: 'task:602',
        occurredAt: null,
        excerptKind: 'TASK_TITLE',
        excerpt: '해열 후 체온 재측정',
      },
    ]);
  });

  it('발신 SENDER와 수신 RECEIVER role, 서울 날짜, 미래 수신 근무를 함께 제한한다', async () => {
    const senderFind = jest.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000801',
      startsAt: new Date('2026-08-18T00:00:00.000Z'),
      endsAt: new Date('2026-08-18T08:00:00.000Z'),
    });
    const receiverFind = jest.fn().mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000802',
        nurseId: '00000000-0000-4000-8000-000000000202',
        startsAt: new Date('2026-08-18T06:00:00.000Z'),
      },
    ]);
    const repository = new PrismaHandoffPrecheckRepository({
      nurseShift: { findFirst: senderFind, findMany: receiverFind },
      patientAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);

    await repository.resolveShiftScope({
      context: CONTEXT,
      shiftId: '00000000-0000-4000-8000-000000000801',
      targetDuty: 'EVENING',
      date: '2026-08-18',
      now: NOW,
    });

    expect(senderFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          membership: { role: 'SENDER' },
        }),
      }),
    );
    expect(receiverFind).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          membership: { role: 'RECEIVER' },
          startsAt: expect.objectContaining({
            gt: new Date('2026-08-18T00:00:00.000Z'),
          }),
        }),
      }),
    );
  });
});
