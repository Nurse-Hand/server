/* eslint-disable @typescript-eslint/no-require-imports */
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DemoSessionContext } from '../src/modules/demo/application/demo-session-context';
import { DemoSessionGuard } from '../src/modules/demo/presentation/demo-session.guard';
import type {
  CreateStoredFileRecordInput,
  StoredFileRecord,
} from '../src/modules/files/application/ports/stored-file.repository';
import { STORED_FILE_REPOSITORY } from '../src/modules/files/application/ports/stored-file.repository';

const storageRoot = mkdtempSync(join(tmpdir(), 'nh-files-e2e-'));

process.env.FILE_STORAGE_ROOT = storageRoot;

const { AppModule } =
  require('../src/app.module') as typeof import('../src/app.module');
const { configureApplication } =
  require('../src/bootstrap/configure-application') as typeof import('../src/bootstrap/configure-application');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEMO_CONTEXT: DemoSessionContext = {
  actorId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d62',
  datasetId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d60',
  wardId: '018f1da8-6c39-4f1d-8f2f-0f9bc2f58d61',
};

class InMemoryStoredFileRepository {
  readonly records: StoredFileRecord[] = [];

  async create(input: CreateStoredFileRecordInput): Promise<StoredFileRecord> {
    const record: StoredFileRecord = {
      ...input,
      createdAt: new Date(),
      id: randomUUID(),
    };

    this.records.push(record);
    return record;
  }

  reset(): void {
    this.records.length = 0;
  }
}

describe('Files (e2e)', () => {
  let app: INestApplication;
  let repository: InMemoryStoredFileRepository;

  beforeAll(async () => {
    repository = new InMemoryStoredFileRepository();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DemoSessionGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().demoSessionContext = DEMO_CONTEXT;
          return true;
        },
      })
      .overrideProvider(STORED_FILE_REPOSITORY)
      .useValue(repository)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    repository.reset();
    await Promise.all(
      ['audio', 'photos', 'tmp'].map((directoryName) =>
        rm(join(storageRoot, directoryName), {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  afterAll(async () => {
    await app.close();
    await rm(storageRoot, { force: true, recursive: true });
  });

  it('POST /api/v1/files/audio는 audio 디렉터리에 파일을 저장한다', async () => {
    const fileBuffer = Buffer.from('synthetic-audio-bytes');
    const response = await request(app.getHttpServer())
      .post('/api/v1/files/audio')
      .attach('file', fileBuffer, {
        contentType: 'audio/mp4',
        filename: 'shift-rounding.m4a',
      })
      .expect(201);

    expect(response.body).toEqual({
      data: {
        checksum: expect.any(String),
        createdAt: expect.any(String),
        id: expect.stringMatching(UUID_PATTERN),
        kind: 'AUDIO',
        mimeType: 'audio/mp4',
        originalName: 'shift-rounding.m4a',
        sizeBytes: fileBuffer.length,
      },
      meta: {
        requestId: expect.stringMatching(UUID_PATTERN),
      },
    });
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
    expect(repository.records).toHaveLength(1);
    expect(repository.records[0]).toMatchObject({
      actorId: DEMO_CONTEXT.actorId,
      datasetId: DEMO_CONTEXT.datasetId,
      wardId: DEMO_CONTEXT.wardId,
    });
    expect(repository.records[0]?.storageUri).toMatch(
      /^local:\/\/\/audio\/.+\.m4a$/,
    );

    const audioEntries = await readdir(join(storageRoot, 'audio'));
    const tmpEntries = await readDirectory(join(storageRoot, 'tmp'));

    expect(audioEntries).toHaveLength(1);
    expect(tmpEntries).toEqual([]);
    await expect(
      readFile(join(storageRoot, 'audio', audioEntries[0] as string)),
    ).resolves.toEqual(fileBuffer);
  });

  it.each(['audio/x-m4a', 'audio/m4a', 'video/mp4'])(
    'POST /api/v1/files/audio는 모바일 m4a MIME alias %s를 저장한다',
    async (contentType) => {
      const fileBuffer = Buffer.from(`synthetic-${contentType}-bytes`);
      const response = await request(app.getHttpServer())
        .post('/api/v1/files/audio')
        .attach('file', fileBuffer, {
          contentType,
          filename: 'quick-note.m4a',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        kind: 'AUDIO',
        mimeType: 'audio/mp4',
        originalName: 'quick-note.m4a',
        sizeBytes: fileBuffer.length,
      });
    },
  );

  it('POST /api/v1/files/photos는 photos 디렉터리에 파일을 저장한다', async () => {
    const fileBuffer = Buffer.from('synthetic-photo-bytes');
    const response = await request(app.getHttpServer())
      .post('/api/v1/files/photos')
      .attach('file', fileBuffer, {
        contentType: 'image/png',
        filename: 'ward-board.png',
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      kind: 'PHOTO',
      mimeType: 'image/png',
      originalName: 'ward-board.png',
      sizeBytes: fileBuffer.length,
    });
    expect(repository.records[0]?.storageUri).toMatch(
      /^local:\/\/\/photos\/.+\.png$/,
    );
    await expect(readdir(join(storageRoot, 'photos'))).resolves.toHaveLength(1);
  });

  it('검증 실패 시 tmp와 최종 디렉터리에 파일을 남기지 않는다', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/files/audio')
      .attach('file', Buffer.from('invalid-audio'), {
        contentType: 'audio/mp4',
        filename: 'shift-rounding.txt',
      })
      .expect(422);

    expect(response.body.error).toEqual({
      code: 'FILE_EXTENSION_INVALID',
      details: {
        allowedExtensions: [
          '.aac',
          '.flac',
          '.m4a',
          '.mp3',
          '.ogg',
          '.wav',
          '.webm',
        ],
        extension: '.txt',
        kind: 'AUDIO',
      },
      message: '지원하지 않는 파일 확장자입니다.',
    });
    await expect(readDirectory(join(storageRoot, 'audio'))).resolves.toEqual(
      [],
    );
    await expect(readDirectory(join(storageRoot, 'tmp'))).resolves.toEqual([]);
  });
});

async function readDirectory(directoryPath: string): Promise<string[]> {
  try {
    return await readdir(directoryPath);
  } catch {
    return [];
  }
}
