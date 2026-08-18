const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

const SAFE_NAME_PATTERN = /^nh_it_[a-z0-9_]{1,57}$/;

async function main() {
  const target = parseTarget(process.env.TEST_DATABASE_URL);
  const adminClient = new Client({ connectionString: target.baseUrl });
  let schemaCreated = false;

  await adminClient.connect();

  try {
    await adminClient.query(`CREATE SCHEMA "${target.schema}"`);
    schemaCreated = true;

    const integrationEnvironment = {
      ...process.env,
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      DEMO_SESSION_TTL_SECONDS: '25200',
      DATABASE_URL: target.scopedUrl,
      TEST_DATABASE_URL: target.scopedUrl,
      NH_IT_SCHEMA: target.schema,
    };

    run('npm', ['run', 'prisma:generate'], integrationEnvironment);
    run('npx', ['prisma', 'migrate', 'deploy'], integrationEnvironment);
    run('npx', ['prisma', 'db', 'seed'], integrationEnvironment);
    run('npx', ['prisma', 'db', 'seed'], integrationEnvironment);
    run(
      'npx',
      ['jest', '--config', 'test/jest-integration.config.cjs', '--runInBand'],
      integrationEnvironment,
    );
  } finally {
    if (schemaCreated) {
      assertSafeName(target.schema, 'schema');
      await adminClient.query(`DROP SCHEMA "${target.schema}" CASCADE`);
    }

    await adminClient.end();
  }
}

function parseTarget(rawUrl) {
  if (!rawUrl) {
    throw new Error('TEST_DATABASE_URL이 필요합니다.');
  }

  const parsed = new URL(rawUrl);

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('TEST_DATABASE_URL은 PostgreSQL URL이어야 합니다.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  assertSafeName(databaseName, 'database');

  const requestedSchema = parsed.searchParams.get('schema');
  const schema =
    requestedSchema ?? `nh_it_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  assertSafeName(schema, 'schema');

  const base = new URL(parsed);
  base.searchParams.delete('schema');
  const scoped = new URL(base);
  scoped.searchParams.set('schema', schema);

  return {
    baseUrl: base.toString(),
    scopedUrl: scoped.toString(),
    schema,
  };
}

function assertSafeName(value, label) {
  if (!SAFE_NAME_PATTERN.test(value)) {
    throw new Error(`${label} 이름은 안전한 nh_it_* prefix여야 합니다.`);
  }
}

function run(command, args, environment) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 실패: ${result.status}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '통합 테스트 실패');
  process.exitCode = 1;
});
