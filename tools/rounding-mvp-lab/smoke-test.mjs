import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const requireAudioFiles = process.env.ROUNDING_MVP_LAB_REQUIRE_AUDIO === '1';

const requiredFiles = [
  'public/index.html',
  'public/app.js',
  'public/styles.css',
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
  const absolutePath = path.join(toolDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`required file missing: ${relativePath}`);
  }
}

const html = fs.readFileSync(path.join(toolDir, 'public/index.html'), 'utf8');
if (!html.includes('./styles.css') || !html.includes('./app.js')) {
  throw new Error('index.html must reference styles.css and app.js');
}
if (!html.includes('../mockdata/embedded-mockdata.js')) {
  throw new Error('index.html must reference embedded-mockdata.js');
}

new vm.Script(fs.readFileSync(path.join(toolDir, 'public/app.js'), 'utf8'), {
  filename: 'public/app.js',
});

const jsonFiles = {
  nurses: readJson('mockdata/nurses.json'),
  patients: readJson('mockdata/patients.json'),
  tasks: readJson('mockdata/tasks.json'),
  rounding: readJson('mockdata/rounding.json'),
  audioManifest: readJson('mockdata/audio-manifest.json'),
  expectedResults: readJson('mockdata/expected-results.json'),
};

const sandbox = { window: {} };
vm.createContext(sandbox);
new vm.Script(
  fs.readFileSync(path.join(toolDir, 'mockdata/embedded-mockdata.js'), 'utf8'),
  {
    filename: 'mockdata/embedded-mockdata.js',
  },
).runInContext(sandbox);

const embedded = sandbox.window.__ROUNDING_MVP_LAB_DATA__;
if (!embedded) {
  throw new Error(
    'embedded mockdata did not populate window.__ROUNDING_MVP_LAB_DATA__',
  );
}

for (const [key, parsedJson] of Object.entries(jsonFiles)) {
  if (JSON.stringify(parsedJson) !== JSON.stringify(embedded[key])) {
    throw new Error(`embedded mockdata mismatch: ${key}`);
  }
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

if (jsonFiles.audioManifest.items.length !== 6) {
  throw new Error('audio-manifest must contain 6 items');
}

for (const visit of jsonFiles.rounding.visitPlan) {
  if (!patientIds.has(visit.patientId)) {
    throw new Error(`visit references unknown patientId: ${visit.patientId}`);
  }
  if (!audioAssetIds.has(visit.audioAssetId)) {
    throw new Error(
      `visit references unknown audioAssetId: ${visit.audioAssetId}`,
    );
  }
}

for (const visitResult of jsonFiles.expectedResults.visitResults) {
  if (!visitIds.has(visitResult.visitId)) {
    throw new Error(
      `expected-results references unknown visitId: ${visitResult.visitId}`,
    );
  }
  if (!audioAssetIds.has(visitResult.audioAssetId)) {
    throw new Error(
      `expected-results references unknown audioAssetId: ${visitResult.audioAssetId}`,
    );
  }
}

for (const item of jsonFiles.audioManifest.items) {
  const resolvedRelative = path.resolve(toolDir, item.relativePathFromToolDir);
  if (requireAudioFiles && !fs.existsSync(resolvedRelative)) {
    throw new Error(
      `relative audio path missing: ${item.relativePathFromToolDir}`,
    );
  }
  if (
    !requireAudioFiles &&
    !item.workspaceRelativePath.startsWith('record_data/')
  ) {
    throw new Error(
      `workspaceRelativePath must stay under record_data: ${item.workspaceRelativePath}`,
    );
  }
}

console.log('Smoke test passed:');
console.log(`- files: ${requiredFiles.length}`);
console.log(`- patients: ${jsonFiles.patients.items.length}`);
console.log(`- visits: ${jsonFiles.rounding.visitPlan.length}`);
console.log(`- audio manifest items: ${jsonFiles.audioManifest.items.length}`);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(toolDir, relativePath), 'utf8'));
}
