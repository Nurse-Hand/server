import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  TimelineEventReadModel,
  TimelineReader,
} from '../../timeline/application/ports/timeline-reader';

class HandoffTimelineReader {
  constructor(private readonly timelineReader: TimelineReader) {}

  read(
    context: DemoSessionContext,
    patientIds: readonly string[],
  ): Promise<readonly TimelineEventReadModel[]> {
    return this.timelineReader.readMany({ context, patientIds });
  }
}

describe('TimelineReader Handoff batch contract', () => {
  it('여러 환자를 Prisma 없이 fake Port에 한 번만 위임한다', async () => {
    const expected: TimelineEventReadModel[] = [];
    const fake: TimelineReader = {
      read: jest.fn(),
      readMany: jest.fn().mockResolvedValue(expected),
    };
    const consumer = new HandoffTimelineReader(fake);
    const context = {
      datasetId: '00000000-0000-4000-8000-000000000101',
      actorId: '00000000-0000-4000-8000-000000000201',
      wardId: '00000000-0000-4000-8000-000000000301',
    };
    const patientIds = [
      '00000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000402',
    ];

    await expect(consumer.read(context, patientIds)).resolves.toBe(expected);
    expect(fake.readMany).toHaveBeenCalledTimes(1);
    expect(fake.readMany).toHaveBeenCalledWith({ context, patientIds });
    expect(fake.read).not.toHaveBeenCalled();
  });
});
