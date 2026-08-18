import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('개발 환경에는 안전한 로컬 기본값을 적용한다', () => {
    const environment = validateEnvironment({ NODE_ENV: 'development' });

    expect(environment).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL:
        'postgresql://nurse_hand:nurse_hand@localhost:5432/nurse_hand',
      DEMO_MODE: false,
      DEMO_SESSION_TTL_SECONDS: 25200,
    });
  });

  it('운영 환경에서 DATABASE_URL이 없으면 시작을 거부한다', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      '환경변수 검증 실패: DATABASE_URL',
    );
  });

  it('운영 환경에서 DEMO_MODE=true이면 시작을 거부한다', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/nh',
        DEMO_MODE: 'true',
      }),
    ).toThrow('환경변수 검증 실패: DEMO_MODE');
  });

  it('DEMO_MODE=false 문자열을 false로 해석한다', () => {
    expect(
      validateEnvironment({ NODE_ENV: 'test', DEMO_MODE: 'false' }).DEMO_MODE,
    ).toBe(false);
  });

  it('demo session TTL이 7시간을 넘으면 거부한다', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'test',
        DEMO_SESSION_TTL_SECONDS: '25201',
      }),
    ).toThrow('환경변수 검증 실패: DEMO_SESSION_TTL_SECONDS');
  });

  it('유효하지 않은 포트를 거부한다', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'test', PORT: '70000' }),
    ).toThrow('환경변수 검증 실패: PORT');
  });
});
