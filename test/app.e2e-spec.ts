import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller('_test/protected')
class ProtectedProbeController {
  @Get()
  read(): { exposed: boolean } {
    return { exposed: true };
  }
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Health 응답을 공통 성공 envelope로 반환한다', async () => {
    const requestId = '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d63';
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', requestId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body).toEqual({
      data: {
        status: 'ok',
        timestamp: expect.any(String),
      },
      meta: { requestId },
    });
  });

  it('로컬 UI origin에서 API 호출을 허용한다', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });

  it('유효하지 않은 Request ID를 서버 UUID로 교체한다', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'not-a-uuid')
      .expect(200);

    expect(response.body.meta.requestId).toMatch(UUID_PATTERN);
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });

  it('없는 경로를 공통 실패 envelope로 반환한다', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: '요청한 경로를 찾을 수 없습니다.',
      },
      meta: {
        requestId: expect.stringMatching(UUID_PATTERN),
      },
    });
  });

  it('DEMO_MODE=false이면 demo session route를 404로 숨긴다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/demo-sessions')
      .send({ scenarioKey: 'SYNTHETIC_MEDICAL_DAY_SHIFT' })
      .expect(404);

    expect(response.body.error).toEqual({
      code: 'ROUTE_NOT_FOUND',
      message: '요청한 경로를 찾을 수 없습니다.',
    });
  });

  it('DEMO_MODE=false이면 skip되지 않은 새 route도 전역 guard가 404로 막는다', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/_test/protected')
      .expect(404);

    expect(response.body.error).toEqual({
      code: 'ROUTE_NOT_FOUND',
      message: '요청한 경로를 찾을 수 없습니다.',
    });
  });
});
