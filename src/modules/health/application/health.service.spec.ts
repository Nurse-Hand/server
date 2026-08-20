import type { DatabaseReadinessProbe } from './database-readiness.probe';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let probe: jest.Mocked<DatabaseReadinessProbe>;
  let service: HealthService;

  beforeEach(() => {
    probe = { check: jest.fn().mockResolvedValue(undefined) };
    service = new HealthService(probe);
  });

  it('데이터베이스 확인 후 readiness 결과를 반환한다', async () => {
    await expect(service.getHealth()).resolves.toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
    expect(probe.check).toHaveBeenCalledTimes(1);
  });

  it('데이터베이스 확인 실패를 성공으로 숨기지 않는다', async () => {
    const failure = new Error('synthetic database unavailable');
    probe.check.mockRejectedValueOnce(failure);

    await expect(service.getHealth()).rejects.toBe(failure);
  });
});
