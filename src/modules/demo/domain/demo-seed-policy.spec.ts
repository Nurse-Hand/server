import { assertDemoSeedAllowed } from './demo-seed-policy';

describe('assertDemoSeedAllowed', () => {
  it('production seed를 DEMO_MODE 값과 무관하게 거부한다', () => {
    expect(() => assertDemoSeedAllowed('production', 'true')).toThrow(
      'DEMO_SCENARIO_NOT_ALLOWED',
    );
  });

  it('DEMO_MODE=true인 비운영 환경만 허용한다', () => {
    expect(() => assertDemoSeedAllowed('test', 'true')).not.toThrow();
    expect(() => assertDemoSeedAllowed('development', 'true')).not.toThrow();
    expect(() => assertDemoSeedAllowed('development', 'false')).toThrow(
      'DEMO_SCENARIO_NOT_ALLOWED',
    );
  });

  it.each([undefined, 'prod', 'staging', ''])(
    '알 수 없는 NODE_ENV=%s는 fail-closed로 거부한다',
    (nodeEnvironment) => {
      expect(() => assertDemoSeedAllowed(nodeEnvironment, 'true')).toThrow(
        'DEMO_SCENARIO_NOT_ALLOWED',
      );
    },
  );
});
