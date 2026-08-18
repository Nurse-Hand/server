import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('개발 환경에는 안전한 로컬 기본값을 적용한다', () => {
    const environment = validateEnvironment({ NODE_ENV: 'development' });

    expect(environment).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL:
        'postgresql://nurse_hand:nurse_hand@localhost:5432/nurse_hand',
    });
  });

  it('운영 환경에서 DATABASE_URL이 없으면 시작을 거부한다', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      '환경변수 검증 실패: DATABASE_URL',
    );
  });

  it('유효하지 않은 포트를 거부한다', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'test', PORT: '70000' }),
    ).toThrow('환경변수 검증 실패: PORT');
  });
});
