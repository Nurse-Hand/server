import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap/configure-application';
import { createPublicOpenApiDocument } from './openapi/create-public-openapi-document';

const EXPECTED_TASK_HANDOFF_ROUTES = [
  'GET /api/v1/handoff-prechecks/{precheckId}',
  'GET /api/v1/handoffs',
  'GET /api/v1/handoffs/{handoffId}',
  'GET /api/v1/handoffs/{handoffId}/history',
  'GET /api/v1/task-extraction-jobs/{jobId}',
  'GET /api/v1/tasks',
  'PATCH /api/v1/handoff-prechecks/{precheckId}/items/{itemId}',
  'PATCH /api/v1/handoffs/{handoffId}',
  'PATCH /api/v1/tasks/{taskId}',
  'POST /api/v1/handoff-prechecks',
  'POST /api/v1/handoffs',
  'POST /api/v1/handoffs/{handoffId}/acknowledgements',
  'POST /api/v1/handoffs/{handoffId}/finalize',
  'POST /api/v1/task-extraction-jobs',
  'POST /api/v1/task-extraction-jobs/{jobId}/apply',
  'POST /api/v1/tasks',
] as const;

describe('AppModule Task/Handoff topology', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('Task 6개와 Handoff 10개 route를 중복 없이 등록한다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);

    const document = createPublicOpenApiDocument(app);
    const routes = Object.entries(document.paths).flatMap(([path, item]) =>
      ['get', 'post', 'patch', 'put', 'delete'].flatMap((method) =>
        item?.[method as keyof typeof item]
          ? [`${method.toUpperCase()} ${path}`]
          : [],
      ),
    );
    const taskHandoffRoutes = routes
      .filter(
        (route) =>
          route.includes('/tasks') ||
          route.includes('/task-extraction-jobs') ||
          route.includes('/handoffs') ||
          route.includes('/handoff-prechecks'),
      )
      .sort();

    expect(taskHandoffRoutes).toEqual(EXPECTED_TASK_HANDOFF_ROUTES);
    expect(new Set(taskHandoffRoutes).size).toBe(16);
  });
});
