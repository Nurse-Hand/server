import { readFile } from 'node:fs/promises';

const [cdWorkflow, ciWorkflow, compose, deployScript] = await Promise.all([
  readFile('.github/workflows/cd.yml', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
  readFile('docker-compose.prod.yml', 'utf8'),
  readFile('deploy/deploy-server.sh', 'utf8'),
]);

assertMatch(cdWorkflow, /^  workflow_dispatch:$/m, 'CD must be manual-only');
assertNoMatch(cdWorkflow, /^  push:$/m, 'CD must not deploy on push');
assertIncludes(cdWorkflow, 'cancel-in-progress: false');
assertIncludes(cdWorkflow, 'uses: ./.github/workflows/ci.yml');
assertIncludes(cdWorkflow, 'environment: production');
assertCount(
  cdWorkflow,
  'git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main',
  2,
  'CD must validate current main before build and deployment',
);
assertIncludes(
  cdWorkflow,
  'SERVER_IMAGE must use a valid registry digest reference.',
);
assertIncludes(cdWorkflow, 'StrictHostKeyChecking=yes');
assertIncludes(cdWorkflow, 'GABIA_SSH_KNOWN_HOSTS');
assertNoMatch(
  cdWorkflow,
  /sshpass|SSH_PASSWORD|StrictHostKeyChecking=no|:latest/,
  'CD must not use password SSH, trust-on-first-use, or mutable images',
);

assertMatch(ciWorkflow, /^  workflow_call:$/m, 'CI must be reusable by CD');
assertMatch(
  ciWorkflow,
  /^  pull_request:$/m,
  'CI must validate PR head commits',
);
assertIncludes(ciWorkflow, 'node deploy/safe-deployment-contract.test.mjs');

assertIncludes(compose, "command: ['node', 'dist/src/worker-main.js']");
assertIncludes(
  compose,
  "test: ['CMD', 'node', 'dist/src/worker-healthcheck.js']",
);
assertIncludes(compose, 'stop_grace_period: 30s');
assertNoMatch(
  compose,
  /prisma migrate deploy/,
  'Compose services must not run migration during startup',
);
assertCount(
  deployScript,
  'prisma migrate deploy',
  1,
  'Deployment must own exactly one one-shot migration',
);
assertIncludes(
  deployScript,
  'up -d --no-deps api worker',
  'API and worker must be replaced and rolled back together',
);
assertNoMatch(
  deployScript,
  /\$\{status\}" == "running"/,
  'Worker readiness must require a successful heartbeat healthcheck',
);

process.stdout.write('safe deployment contract tests passed\n');

function assertIncludes(source, expected, message = `Missing: ${expected}`) {
  if (!source.includes(expected)) throw new Error(message);
}

function assertMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNoMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

function assertCount(source, expected, count, message) {
  const actual = source.split(expected).length - 1;
  if (actual !== count) {
    throw new Error(`${message}: expected ${count}, received ${actual}`);
  }
}
