import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const mockdataDir = path.join(toolDir, 'mockdata');
const dataFiles = {
  nurses: 'nurses.json',
  patients: 'patients.json',
  tasks: 'tasks.json',
  rounding: 'rounding.json',
  audioManifest: 'audio-manifest.json',
  expectedResults: 'expected-results.json',
};

const data = Object.fromEntries(
  Object.entries(dataFiles).map(([key, fileName]) => [
    key,
    JSON.parse(fs.readFileSync(path.join(mockdataDir, fileName), 'utf8')),
  ]),
);

const output = `window.__ROUNDING_MVP_LAB_DATA__ = ${JSON.stringify(data, null, 2)};\n`;

fs.writeFileSync(path.join(mockdataDir, 'embedded-mockdata.js'), output);
fs.writeFileSync(path.join(toolDir, 'public', 'embedded-mockdata.js'), output);
