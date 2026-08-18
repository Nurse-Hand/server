import {
  createPrismaPgAdapterConfig,
  parsePrismaPgConnection,
} from './prisma-pg-adapter';

describe('parsePrismaPgConnection', () => {
  it('schema query를 runtime adapter option으로 분리한다', () => {
    expect(
      parsePrismaPgConnection(
        'postgresql://synthetic:synthetic@localhost:5432/nh_it_db?sslmode=disable&schema=nh_it_worker_1',
      ),
    ).toEqual({
      connectionString:
        'postgresql://synthetic:synthetic@localhost:5432/nh_it_db?sslmode=disable',
      schema: 'nh_it_worker_1',
    });
  });

  it('generated query와 raw SQL이 같은 schema를 보도록 search_path도 설정한다', () => {
    expect(
      createPrismaPgAdapterConfig(
        'postgresql://synthetic:synthetic@localhost:5432/nh_it_db?schema=nh_it_worker_1',
      ),
    ).toEqual({
      poolConfig: {
        connectionString:
          'postgresql://synthetic:synthetic@localhost:5432/nh_it_db',
        options: '-c search_path=nh_it_worker_1',
      },
      adapterOptions: { schema: 'nh_it_worker_1' },
    });
  });

  it('안전하지 않은 schema 이름을 거부한다', () => {
    expect(() =>
      parsePrismaPgConnection(
        'postgresql://synthetic:synthetic@localhost/nh_it_db?schema=public;drop',
      ),
    ).toThrow('schema 이름');
  });

  it('인용 규칙이 달라질 수 있는 대문자 schema 이름을 거부한다', () => {
    expect(() =>
      createPrismaPgAdapterConfig(
        'postgresql://synthetic:synthetic@localhost/nh_it_db?schema=NH_IT_1',
      ),
    ).toThrow('schema 이름');
  });
});
