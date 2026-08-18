import type { Prisma } from '../../../generated/prisma/client';
import { Clock } from '../../../common/time/clock';
import { DemoScenarioSeeder } from './demo-scenario.seeder';

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-08-18T02:00:00.000Z');
  }
}

describe('DemoScenarioSeeder', () => {
  it('Clock 기준으로 shift, assignment, timeline 시간을 결정한다', async () => {
    const transaction = createTransaction();
    const seeder = new DemoScenarioSeeder(new FixedClock());

    const seeded = await seeder.seed(
      transaction,
      '00000000-0000-4000-8000-000000000101',
      'SYNTHETIC_MEDICAL_DAY_SHIFT',
    );

    expect(transaction.nurseShift.upsert.mock.calls[0][0]).toMatchObject({
      update: {
        duty: 'DAY',
        startsAt: new Date('2026-08-18T01:00:00.000Z'),
        endsAt: new Date('2026-08-18T09:00:00.000Z'),
      },
    });
    expect(transaction.nurseShift.upsert.mock.calls[1][0]).toMatchObject({
      update: {
        duty: 'EVENING',
        startsAt: new Date('2026-08-18T09:00:00.000Z'),
        endsAt: new Date('2026-08-18T17:00:00.000Z'),
      },
    });
    for (const call of transaction.patientAssignment.upsert.mock.calls) {
      expect(call[0]).toMatchObject({
        update: {
          startsAt: new Date('2026-08-18T01:00:00.000Z'),
          endsAt: new Date('2026-08-18T09:00:00.000Z'),
        },
      });
    }
    expect(
      transaction.timelineEvent.upsert.mock.calls.map(
        ([input]) => input.update.occurredAt,
      ),
    ).toEqual([
      new Date('2026-08-18T01:30:00.000Z'),
      new Date('2026-08-18T01:45:00.000Z'),
    ]);
    expect(seeded.senderShiftEndsAt).toEqual(
      new Date('2026-08-18T09:00:00.000Z'),
    );
  });

  it('allowlist 밖 scenario는 DB 접근 전에 거부한다', async () => {
    const transaction = createTransaction();
    const seeder = new DemoScenarioSeeder(new FixedClock());

    await expect(
      seeder.seed(
        transaction,
        '00000000-0000-4000-8000-000000000101',
        'UNLISTED_SCENARIO' as never,
      ),
    ).rejects.toMatchObject({ code: 'DEMO_SCENARIO_NOT_ALLOWED' });
    expect(transaction.ward.upsert).not.toHaveBeenCalled();
  });
});

type MockTransaction = {
  ward: { upsert: jest.Mock };
  nurse: { upsert: jest.Mock };
  wardMembership: { upsert: jest.Mock };
  nurseShift: { upsert: jest.Mock };
  patient: { upsert: jest.Mock };
  patientAssignment: { upsert: jest.Mock };
  timelineEvent: { upsert: jest.Mock };
};

function createTransaction(): Prisma.TransactionClient & MockTransaction {
  const transaction: MockTransaction = {
    ward: {
      upsert: jest.fn().mockResolvedValue({ id: 'ward-id' }),
    },
    nurse: {
      upsert: jest
        .fn()
        .mockResolvedValueOnce({ id: 'actor-id' })
        .mockResolvedValueOnce({ id: 'receiver-id' }),
    },
    wardMembership: {
      upsert: jest.fn().mockResolvedValue({ id: 'membership-id' }),
    },
    nurseShift: {
      upsert: jest
        .fn()
        .mockResolvedValueOnce({ id: 'actor-shift-id' })
        .mockResolvedValueOnce({ id: 'receiver-shift-id' }),
    },
    patient: {
      upsert: jest
        .fn()
        .mockResolvedValueOnce({ id: 'patient-a-id' })
        .mockResolvedValueOnce({ id: 'patient-b-id' }),
    },
    patientAssignment: {
      upsert: jest.fn().mockResolvedValue({ id: 'assignment-id' }),
    },
    timelineEvent: {
      upsert: jest
        .fn()
        .mockResolvedValueOnce({ id: 'event-a-id' })
        .mockResolvedValueOnce({ id: 'event-b-id' }),
    },
  };

  return transaction as Prisma.TransactionClient & MockTransaction;
}
