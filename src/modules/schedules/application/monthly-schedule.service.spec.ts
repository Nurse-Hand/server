import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { MonthlyScheduleInvalidError } from '../domain/monthly-schedule.errors';
import type { MonthlyScheduleRepository } from './ports/monthly-schedule.repository';
import { MonthlyScheduleService } from './monthly-schedule.service';

const context: DemoSessionContext = {
  datasetId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000102',
  wardId: '00000000-0000-4000-8000-000000000103',
};

describe('MonthlyScheduleService', () => {
  let repository: jest.Mocked<MonthlyScheduleRepository>;
  let service: MonthlyScheduleService;

  beforeEach(() => {
    repository = {
      save: jest.fn().mockResolvedValue({
        schedule: {
          yearMonth: '2026-08',
          version: 1,
          entries: [],
          totals: { DAY: 0, EVENING: 0, NIGHT: 0, OFF: 0 },
        },
        isReplay: false,
      }),
      find: jest.fn(),
    };
    service = new MonthlyScheduleService(repository);
  });

  it('날짜를 정렬한 canonical 요청 hash와 함께 저장한다', async () => {
    await service.put(context, '2026-08', 'schedule-save-1', {
      expectedVersion: 0,
      entries: [
        { date: '2026-08-02', duty: 'OFF' },
        { date: '2026-08-01', duty: 'DAY' },
      ],
    });

    expect(repository.save).toHaveBeenCalledWith({
      context,
      yearMonth: '2026-08',
      expectedVersion: 0,
      entries: [
        { date: '2026-08-01', duty: 'DAY' },
        { date: '2026-08-02', duty: 'OFF' },
      ],
      idempotencyKey: 'schedule-save-1',
      requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('빈 월을 유효한 전체 교체 요청으로 전달한다', async () => {
    await service.put(context, '2026-08', 'schedule-clear-1', {
      expectedVersion: 2,
      entries: [],
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [], expectedVersion: 2 }),
    );
  });

  it.each([
    ['잘못된 월', '2026-13', 0, 'valid-key'],
    ['음수 version', '2026-08', -1, 'valid-key'],
    ['빈 멱등성 키', '2026-08', 0, ''],
  ])(
    '%s을 저장소 호출 전에 거부한다',
    async (_name, yearMonth, version, key) => {
      expect(() =>
        service.put(context, yearMonth, key, {
          expectedVersion: version,
          entries: [],
        }),
      ).toThrow(MonthlyScheduleInvalidError);
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('실재하지 않는 날짜를 저장소 호출 전에 거부한다', () => {
    expect(() =>
      service.put(context, '2026-02', 'valid-key', {
        expectedVersion: 0,
        entries: [{ date: '2026-02-29', duty: 'DAY' }],
      }),
    ).toThrow(MonthlyScheduleInvalidError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('유효한 월 조회만 repository에 전달한다', async () => {
    repository.find.mockResolvedValue({
      yearMonth: '2026-08',
      version: 1,
      entries: [],
      totals: { DAY: 0, EVENING: 0, NIGHT: 0, OFF: 0 },
    });

    await service.find(context, '2026-08');
    expect(repository.find).toHaveBeenCalledWith(context, '2026-08');
    expect(() => service.find(context, '2026-8')).toThrow(
      MonthlyScheduleInvalidError,
    );
  });
});
