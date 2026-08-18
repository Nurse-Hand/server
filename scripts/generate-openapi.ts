import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildOpenApiDocument,
  serializeOpenApiDocument,
} from './build-openapi-document';

async function generateOpenApi(): Promise<void> {
  const outputPath = resolve(process.cwd(), 'openapi/public.json');
  const document = await buildOpenApiDocument();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeOpenApiDocument(document), 'utf8');
}

generateOpenApi().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'OpenAPI 생성 실패');
  process.exitCode = 1;
});
