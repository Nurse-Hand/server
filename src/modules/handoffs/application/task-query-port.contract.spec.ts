import {
  type TaskQueryContext,
  type TaskQueryPort,
  type TaskReadModel,
} from '../../tasks/application/ports/task-query.port';

class HandoffTaskReader {
  constructor(private readonly taskQueryPort: TaskQueryPort) {}

  read(context: TaskQueryContext, patientIds: readonly string[]) {
    return this.taskQueryPort.findIncompleteByPatients(context, patientIds);
  }
}

describe('TaskQueryPort Handoff contract', () => {
  it('Handoff 단위 테스트가 Prisma 없이 fake Port를 주입할 수 있다', async () => {
    const expected: TaskReadModel[] = [
      {
        id: '00000000-0000-4000-8000-000000000501',
        patientId: '00000000-0000-4000-8000-000000000401',
        title: 'Synthetic task',
        dueAt: new Date('2026-01-15T10:00:00.000Z'),
        effectivePriority: 'HIGH',
        version: 1,
        sourceReferences: ['timeline:synthetic-observation-a'],
        updatedAt: new Date('2026-01-15T09:00:00.000Z'),
      },
    ];
    const fake: TaskQueryPort = {
      findIncompleteByPatients: jest.fn().mockResolvedValue(expected),
    };
    const reader = new HandoffTaskReader(fake);
    const context = {
      datasetId: '00000000-0000-4000-8000-000000000101',
      actorId: '00000000-0000-4000-8000-000000000201',
      wardId: '00000000-0000-4000-8000-000000000301',
    };

    const patientIds = [
      expected[0].patientId!,
      '00000000-0000-4000-8000-000000000402',
    ];

    await expect(reader.read(context, patientIds)).resolves.toBe(expected);
    expect(fake.findIncompleteByPatients).toHaveBeenCalledWith(
      context,
      patientIds,
    );
  });
});
