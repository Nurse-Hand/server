import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const requireAudioFiles = process.env.ROUNDING_MVP_LAB_REQUIRE_AUDIO === '1';

const requiredFiles = [
  'public/index.html',
  'public/app.js',
  'public/api-client.js',
  'public/styles.css',
  'public/embedded-mockdata.js',
  'mockdata/nurses.json',
  'mockdata/patients.json',
  'mockdata/tasks.json',
  'mockdata/rounding.json',
  'mockdata/audio-manifest.json',
  'mockdata/expected-results.json',
  'mockdata/embedded-mockdata.js',
  'generate-embedded-mockdata.mjs',
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(toolDir, relativePath))) {
    throw new Error(`required file missing: ${relativePath}`);
  }
}

const html = readText('public/index.html');
for (const assetPath of [
  './styles.css',
  './embedded-mockdata.js',
  './api-client.js',
  './app.js',
]) {
  assert.match(html, new RegExp(escapeRegExp(assetPath)));
}
assert.match(html, /id="handoff-date"/);

const appSource = readText('public/app.js');
const apiClientSource = readText('public/api-client.js');
new vm.Script(appSource, { filename: 'public/app.js' });
new vm.Script(apiClientSource, { filename: 'public/api-client.js' });
assert.match(appSource, /new FormData\(\)/);
assert.match(appSource, /formData\.append\('file', file, file\.name\)/);
assert.match(
  appSource,
  /const multipartFiles = \[state\.uploads\.roundingLibrary\[0\]\.file\]/,
);
assert.match(
  appSource,
  /const scopedRequest = `\$\{scope\}:\$\{requestIdentity\}`/,
);
const roundingUploadInput = html.match(
  /<input\s+id="rounding-upload"[\s\S]*?\/>/,
)?.[0];
assert.ok(roundingUploadInput);
assert.doesNotMatch(roundingUploadInput, /\bmultiple\b/);
const localCompose = readText('../../docker-compose.local.yml');
assert.match(localCompose, /resolver 127\.0\.0\.11 valid=10s ipv6=off/);
assert.match(localCompose, /set \$\$api_upstream http:\/\/api:3000/);
assert.match(localCompose, /proxy_pass \$\$api_upstream/);

const jsonFiles = {
  nurses: readJson('mockdata/nurses.json'),
  patients: readJson('mockdata/patients.json'),
  tasks: readJson('mockdata/tasks.json'),
  rounding: readJson('mockdata/rounding.json'),
  audioManifest: readJson('mockdata/audio-manifest.json'),
  expectedResults: readJson('mockdata/expected-results.json'),
};

for (const embeddedPath of [
  'mockdata/embedded-mockdata.js',
  'public/embedded-mockdata.js',
]) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  new vm.Script(readText(embeddedPath), {
    filename: embeddedPath,
  }).runInContext(sandbox);

  const embedded = sandbox.window.__ROUNDING_MVP_LAB_DATA__;
  assert.ok(embedded, `${embeddedPath} did not populate embedded mockdata`);
  for (const [key, parsedJson] of Object.entries(jsonFiles)) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(embedded[key])),
      parsedJson,
      `embedded mockdata mismatch: ${embeddedPath}:${key}`,
    );
  }
}

assert.equal(
  jsonFiles.rounding.sessionTemplate.apiPaths.audioUpload,
  '/api/v1/files/audio',
);
assert.equal(
  Object.hasOwn(jsonFiles.rounding.sessionTemplate.apiPaths, 'audioAnalyze'),
  false,
);
assert.equal(
  jsonFiles.rounding.sessionTemplate.apiPaths.analysisStart,
  '/api/v1/rounding-sessions/{sessionId}/analysis-jobs',
);
assert.equal(
  jsonFiles.rounding.sessionTemplate.apiPaths.analysisConfirm,
  '/api/v1/rounding-sessions/{sessionId}/analysis-confirmation',
);
assert.equal(
  Object.hasOwn(jsonFiles.rounding.sessionTemplate.apiPaths, 'tasksExtract'),
  false,
);
assert.doesNotMatch(html, /data-action="extract-tasks"/);

const publicOpenApi = JSON.parse(
  fs.readFileSync(path.resolve(toolDir, '../../openapi/public.json'), 'utf8'),
);
const requiredOperations = [
  ['get', '/api/v1/health'],
  ['post', '/api/v1/demo-sessions'],
  ['get', '/api/v1/patients'],
  ['post', '/api/v1/rounding-sessions'],
  ['post', '/api/v1/rounding-sessions/{sessionId}/patient-segments'],
  ['post', '/api/v1/rounding-sessions/{sessionId}/complete'],
  ['post', '/api/v1/files/audio'],
  ['post', '/api/v1/rounding-sessions/{sessionId}/analysis-jobs'],
  ['get', '/api/v1/rounding-analysis-jobs/{jobId}'],
  ['post', '/api/v1/rounding-sessions/{sessionId}/analysis-confirmation'],
  ['get', '/api/v1/tasks'],
  ['post', '/api/v1/handoff-prechecks'],
  ['get', '/api/v1/handoff-prechecks/{precheckId}'],
  ['post', '/api/v1/handoffs'],
  ['get', '/api/v1/handoffs/{handoffId}'],
];
for (const [method, route] of requiredOperations) {
  assert.ok(
    publicOpenApi.paths?.[route]?.[method],
    `OpenAPI operation missing: ${method.toUpperCase()} ${route}`,
  );
}

const patientIds = new Set(
  jsonFiles.patients.items.map((item) => item.patientId),
);
const visitIds = new Set(
  jsonFiles.rounding.visitPlan.map((item) => item.visitId),
);
const audioAssetIds = new Set(
  jsonFiles.audioManifest.items.map((item) => item.audioAssetId),
);
assert.equal(jsonFiles.audioManifest.items.length, 6);

for (const visit of jsonFiles.rounding.visitPlan) {
  assert.ok(patientIds.has(visit.patientId));
  assert.ok(audioAssetIds.has(visit.audioAssetId));
}

for (const visitResult of jsonFiles.expectedResults.visitResults) {
  assert.ok(visitIds.has(visitResult.visitId));
  assert.ok(audioAssetIds.has(visitResult.audioAssetId));
}

for (const item of jsonFiles.audioManifest.items) {
  assert.doesNotMatch(item.workspaceRelativePath, /^[A-Za-z]:[\\/]/);
  assert.doesNotMatch(item.relativePathFromToolDir, /^[A-Za-z]:[\\/]/);
  assert.doesNotMatch(item.workspaceRelativePath, /^\/Users\//);
  const resolvedRelative = path.resolve(toolDir, item.relativePathFromToolDir);
  if (requireAudioFiles) {
    assert.ok(
      fs.existsSync(resolvedRelative),
      `relative audio path missing: ${item.relativePathFromToolDir}`,
    );
  } else {
    assert.ok(item.workspaceRelativePath.startsWith('record_data/'));
  }
}

for (const task of jsonFiles.tasks.items) {
  assert.ok(['TODO', 'IN_PROGRESS', 'DONE'].includes(task.status));
  assert.ok(['CRITICAL', 'HIGH', 'NORMAL'].includes(task.rulePriority));
  assert.equal(task.source, 'MANUAL');
}

const expected = jsonFiles.expectedResults;
assert.equal(
  expected.roundingAnalysis.mockResponse.data.analysisJob.status,
  'SUCCEEDED',
);
assert.ok(
  expected.roundingAnalysis.mockResponse.data.analysisJob.utterances.length > 0,
);
for (const evidence of expected.roundingAnalysisConfirmation.mockResponse.data
  .evidences) {
  assert.equal(typeof evidence.evidenceId, 'string');
  assert.equal(typeof evidence.timelineEventId, 'string');
  assert.ok(evidence.sourceUtteranceIds.length > 0);
}

assert.equal(
  expected.handoffPrecheck.reservationResponse.data.status,
  'QUEUED',
);
assert.equal(expected.handoffPrecheck.mockResponse.data.status, 'SUCCEEDED');
for (const item of expected.handoffPrecheck.mockResponse.data.items) {
  assert.ok(['CRITICAL', 'RECOMMENDED'].includes(item.severity));
  assert.ok(Array.isArray(item.evidence));
  for (const evidence of item.evidence) {
    assert.equal(typeof evidence.sourceType, 'string');
    assert.equal(typeof evidence.sourceId, 'string');
    assert.equal(typeof evidence.sourceReference, 'string');
  }
}

assert.equal(
  expected.handoffDraft.reservationResponse.data.status,
  'GENERATING',
);
assert.equal(expected.handoffDraft.mockResponse.data.status, 'DRAFT');
const expectedSectionKeys = [
  'activity',
  'diet',
  'observation',
  'pain',
  'patientStatus',
  'treatment',
];
for (const patient of expected.handoffDraft.mockResponse.data.patients) {
  assert.deepEqual(Object.keys(patient.sections).sort(), expectedSectionKeys);
  for (const citation of patient.citations) {
    assert.equal(typeof citation.sourceType, 'string');
    assert.equal(typeof citation.sourceId, 'string');
    assert.equal(typeof citation.section, 'string');
  }
}

await verifyApiClient(apiClientSource);

console.log('Rounding MVP lab smoke test passed:');
console.log(`- files: ${requiredFiles.length}`);
console.log(`- OpenAPI operations: ${requiredOperations.length}`);
console.log(`- patients: ${jsonFiles.patients.items.length}`);
console.log(`- visits: ${jsonFiles.rounding.visitPlan.length}`);
console.log(`- audio manifest items: ${jsonFiles.audioManifest.items.length}`);

async function verifyApiClient(source) {
  const sandbox = {
    AbortController,
    FormData,
    window: {
      clearTimeout,
      setTimeout,
    },
  };
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'public/api-client.js' }).runInContext(
    sandbox,
  );
  const api = sandbox.window.__ROUNDING_MVP_API__;
  assert.ok(api);

  let captured;
  const jsonOutcome = await api.request({
    baseUrl: 'http://localhost:5173/',
    path: '/api/v1/health',
    method: 'POST',
    headers: { 'X-Request-Id': 'request-1' },
    jsonBody: { probe: true },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response(201, { data: { status: 'ok' } });
    },
  });
  assert.equal(jsonOutcome.ok, true);
  assert.equal(captured.url, 'http://localhost:5173/api/v1/health');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.equal(captured.options.body, JSON.stringify({ probe: true }));

  const formData = new FormData();
  formData.append('file', new Blob(['audio']), 'probe.wav');
  await api.request({
    baseUrl: 'http://localhost:5173',
    path: '/api/v1/files/audio',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    formData,
    fetchImpl: async (_url, options) => {
      captured = { options };
      return response(201, { data: { id: 'file-id' } });
    },
  });
  assert.equal(captured.options.headers['Content-Type'], undefined);
  assert.equal(captured.options.body, formData);

  const routeMissing = await api.request({
    baseUrl: 'http://localhost:5173',
    path: '/api/v1/not-registered',
    method: 'GET',
    fetchImpl: async () =>
      response(404, { error: { code: 'ROUTE_NOT_FOUND' } }),
  });
  assert.equal(routeMissing.isRouteNotFound, true);

  const domainMissing = await api.request({
    baseUrl: 'http://localhost:5173',
    path: '/api/v1/patients/missing',
    method: 'GET',
    fetchImpl: async () =>
      response(404, { error: { code: 'PATIENT_NOT_FOUND' } }),
  });
  assert.equal(domainMissing.isRouteNotFound, false);

  for (const status of [400, 401, 403, 409, 422, 500]) {
    const errorOutcome = await api.request({
      baseUrl: 'http://localhost:5173',
      path: '/api/v1/probe',
      method: 'GET',
      fetchImpl: async () =>
        response(status, {
          error: { code: `PROBE_${status}`, message: `status ${status}` },
        }),
    });
    assert.equal(errorOutcome.ok, false);
    assert.equal(errorOutcome.status, status);
    assert.equal(errorOutcome.body.error.code, `PROBE_${status}`);
    assert.equal(errorOutcome.isRouteNotFound, false);
  }

  const timeoutOutcome = await api.request({
    baseUrl: 'http://localhost:5173',
    path: '/api/v1/slow',
    method: 'GET',
    timeoutMs: 1,
    fetchImpl: async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  });
  assert.equal(timeoutOutcome.ok, false);
  assert.equal(timeoutOutcome.status, 0);
  assert.equal(timeoutOutcome.body.error.code, 'TIMEOUT');

  const statuses = ['QUEUED', 'PROCESSING', 'SUCCEEDED'];
  const pollOutcome = await api.poll({
    request: async () =>
      responseOutcome(200, { data: { status: statuses.shift() } }),
    readStatus: (data) => data.status,
    terminalStatuses: ['SUCCEEDED', 'FAILED'],
    successStatuses: ['SUCCEEDED'],
    sleep: async () => {},
  });
  assert.equal(pollOutcome.ok, true);
  assert.equal(pollOutcome.body.data.status, 'SUCCEEDED');
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => JSON.stringify(body),
  };
}

function responseOutcome(status, body) {
  return {
    ok: status >= 200 && status < 300,
    isRouteNotFound: false,
    status,
    statusText: String(status),
    body,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(toolDir, relativePath), 'utf8');
}
