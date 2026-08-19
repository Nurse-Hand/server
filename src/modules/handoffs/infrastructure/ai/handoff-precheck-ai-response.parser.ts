import { isUUID } from 'class-validator';
import { HandoffAiGatewayError } from '../../application/ports/handoff-ai-failure';
import type { HandoffPrecheckAiInput } from '../../application/ports/handoff-precheck-ai.gateway';
import type {
  HandoffPrecheckAiEvidenceReference,
  HandoffPrecheckAiPatientInput,
  HandoffPrecheckAiResult,
  HandoffPrecheckAiSourceType,
} from '../../application/ports/handoff-precheck-ai.types';

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const ISO_TIMESTAMP_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_COLLECTION_SIZE = 1000;

type SnapshotSource = {
  sourceType: HandoffPrecheckAiSourceType;
  sourceId: string;
  patientId: string;
};

type SnapshotRegistry = {
  patientIds: ReadonlySet<string>;
  sources: ReadonlyMap<string, SnapshotSource>;
};

export function parseHandoffPrecheckAiResponse(
  value: unknown,
  input: HandoffPrecheckAiInput,
): HandoffPrecheckAiResult {
  const registry = buildSnapshotRegistry(input.patients);
  const response = readObject(value);
  assertExactKeys(response, [
    'requestId',
    'modelVersion',
    'contractVersion',
    'generatedAt',
    'questions',
  ]);
  const metadata = parseMetadata(response, input.requestId);
  const questions = readArray(response.questions);
  assertCollectionSize(questions);
  const questionKeys = new Set<string>();

  return {
    ...metadata,
    questions: questions.map((questionValue) => {
      const question = readObject(questionValue);
      assertExactKeys(question, [
        'questionKey',
        'patientId',
        'severity',
        'prompt',
        'reason',
        'evidence',
      ]);
      const questionKey = readBoundedString(question.questionKey, 128);
      if (questionKeys.has(questionKey)) invalidResponse();
      questionKeys.add(questionKey);

      const patientId = readUuid(question.patientId);
      if (!registry.patientIds.has(patientId)) invalidResponse();
      const severity = readSeverity(question.severity);
      const prompt = readBoundedString(question.prompt, 1000);
      const reason = readBoundedString(question.reason, 1000);
      const evidence = parseEvidenceArray(question.evidence, registry);

      if (evidence.some((reference) => reference.patientId !== patientId)) {
        invalidResponse();
      }

      return { questionKey, patientId, severity, prompt, reason, evidence };
    }),
  };
}

function parseMetadata(
  response: Record<string, unknown>,
  expectedRequestId: string,
) {
  const requestId = readUuid(response.requestId);
  if (requestId !== expectedRequestId) invalidResponse();
  const modelVersion = readVersion(response.modelVersion);
  const contractVersion = readVersion(response.contractVersion);
  const generatedAtValue = readBoundedString(response.generatedAt, 64);
  if (!ISO_TIMESTAMP_WITH_TIMEZONE.test(generatedAtValue)) invalidResponse();
  const generatedAt = new Date(generatedAtValue);
  if (Number.isNaN(generatedAt.getTime())) invalidResponse();
  return { requestId, modelVersion, contractVersion, generatedAt };
}

function parseEvidenceArray(
  value: unknown,
  registry: SnapshotRegistry,
): readonly HandoffPrecheckAiEvidenceReference[] {
  const rawEvidence = readArray(value);
  assertCollectionSize(rawEvidence);
  if (rawEvidence.length === 0) invalidResponse();
  const evidenceKeys = new Set<string>();

  return rawEvidence.map((referenceValue) => {
    const reference = readObject(referenceValue);
    assertExactKeys(reference, ['sourceType', 'sourceId', 'patientId']);
    const sourceType = readSourceType(reference.sourceType);
    const sourceId = readUuid(reference.sourceId);
    const patientId = readUuid(reference.patientId);
    const expected = registry.sources.get(sourceKey(sourceType, sourceId));
    if (!expected || expected.patientId !== patientId) invalidResponse();
    const key = `${sourceType}:${sourceId}:${patientId}`;
    if (evidenceKeys.has(key)) invalidResponse();
    evidenceKeys.add(key);
    return { sourceType, sourceId, patientId };
  });
}

function buildSnapshotRegistry(
  patients: readonly HandoffPrecheckAiPatientInput[],
): SnapshotRegistry {
  const patientIds = new Set<string>();
  const sources = new Map<string, SnapshotSource>();

  for (const patient of patients) {
    if (!isUUID(patient.patientId) || patientIds.has(patient.patientId)) {
      invalidResponse();
    }
    patientIds.add(patient.patientId);
    for (const event of patient.timelineEvents) {
      addSnapshotSource(sources, {
        sourceType: 'TIMELINE_EVENT',
        sourceId: event.id,
        patientId: patient.patientId,
      });
    }
    for (const task of patient.tasks) {
      addSnapshotSource(sources, {
        sourceType: 'TASK',
        sourceId: task.id,
        patientId: patient.patientId,
      });
    }
  }

  return { patientIds, sources };
}

function addSnapshotSource(
  sources: Map<string, SnapshotSource>,
  source: SnapshotSource,
): void {
  if (!isUUID(source.sourceId)) invalidResponse();
  const key = sourceKey(source.sourceType, source.sourceId);
  if (sources.has(key)) invalidResponse();
  sources.set(key, source);
}

function sourceKey(
  sourceType: HandoffPrecheckAiSourceType,
  sourceId: string,
): string {
  return `${sourceType}:${sourceId}`;
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidResponse();
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) invalidResponse();
  return value as Record<string, unknown>;
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  return value;
}

function readBoundedString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    hasControlCharacter(value)
  ) {
    invalidResponse();
  }
  return value;
}

function readUuid(value: unknown): string {
  if (typeof value !== 'string' || !isUUID(value)) invalidResponse();
  return value;
}

function readVersion(value: unknown): string {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
    invalidResponse();
  }
  return value;
}

function readSeverity(value: unknown): 'CRITICAL' | 'RECOMMENDED' {
  if (value !== 'CRITICAL' && value !== 'RECOMMENDED') invalidResponse();
  return value;
}

function readSourceType(value: unknown): HandoffPrecheckAiSourceType {
  if (value !== 'TIMELINE_EVENT' && value !== 'TASK') invalidResponse();
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    invalidResponse();
  }
}

function assertCollectionSize(values: readonly unknown[]): void {
  if (values.length > MAX_COLLECTION_SIZE) invalidResponse();
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function invalidResponse(): never {
  throw new HandoffAiGatewayError('HANDOFF_AI_INVALID_RESPONSE');
}
