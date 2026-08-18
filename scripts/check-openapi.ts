import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildOpenApiDocument,
  serializeOpenApiDocument,
} from './build-openapi-document';

async function checkOpenApi(): Promise<void> {
  const outputPath = resolve(process.cwd(), 'openapi/public.json');
  const [currentDocument, generatedDocument] = await Promise.all([
    readFile(outputPath, 'utf8'),
    buildOpenApiDocument().then(serializeOpenApiDocument),
  ]);

  if (currentDocument !== generatedDocument) {
    throw new Error(
      'openapi/public.json이 현재 Controller/DTO와 다릅니다. npm run openapi:generate를 실행하세요.',
    );
  }
}

checkOpenApi().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'OpenAPI 검증 실패');
  process.exitCode = 1;
});
