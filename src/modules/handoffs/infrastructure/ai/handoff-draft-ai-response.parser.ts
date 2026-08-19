import { isUUID } from 'class-validator';
import { HandoffAiGatewayError } from '../../application/ports/handoff-ai-failure';
import type { HandoffDraftAiInput } from '../../application/ports/handoff-draft-ai.gateway';
import type {
  HandoffDraftAiEvidenceReference,
  HandoffDraftAiPatientInput,
  HandoffDraftAiPrecheckItemInput,
  HandoffDraftAiResult,
} from '../../application/ports/handoff-draft-ai.types';
import {
  HANDOFF_CLINICAL_SECTIONS,
  type HandoffClinicalSection,
} from '../../domain/handoff.constants';

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const ISO_TIMESTAMP_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_COLLECTION_SIZE = 1000;

type SnapshotSource = HandoffDraftAiEvidenceReference;
type SnapshotRegistry = {
  patientIds: ReadonlySet<string>;
  sources: ReadonlyMap<string, SnapshotSource>;
};

export function parseHandoffDraftAiResponse(
  value: unknown,
  input: HandoffDraftAiInput,
): HandoffDraftAiResult {
  if (input.templateId !== 'NURSING_HANDOFF_V1') invalidResponse();
  const registry = buildSnapshotRegistry(input.patients);
  const unverifiedItems = buildUnverifiedItemRegistry(
    input.precheckItems,
    registry,
  );
  const response = readObject(value);
  assertExactKeys(response, [
    'requestId',
    'modelVersion',
    'contractVersion',
    'generatedAt',
    'patients',
    'warnings',
  ]);
  return {
    ...parseMetadata(response, input.requestId),
    patients: parsePatients(response.patients, registry),
    warnings: parseWarnings(
      response.warnings,
      registry,
      unverifiedItems,
      input.includeUnverified,
    ),
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

function parsePatients(
  value: unknown,
  registry: SnapshotRegistry,
): HandoffDraftAiResult['patients'] {
  const rawPatients = readArray(value);
  if (rawPatients.length !== registry.patientIds.size) invalidResponse();
  const seen = new Set<string>();
  const patients = rawPatients.map((raw) => {
    const patient = readObject(raw);
    assertExactKeys(patient, ['patientId', 'sections']);
    const patientId = readUuid(patient.patientId);
    if (!registry.patientIds.has(patientId) || seen.has(patientId)) {
      invalidResponse();
    }
    seen.add(patientId);
    return {
      patientId,
      sections: parseSections(patient.sections, registry, patientId),
    };
  });
  if ([...registry.patientIds].some((id) => !seen.has(id))) invalidResponse();
  return patients;
}

function parseSections(
  value: unknown,
  registry: SnapshotRegistry,
  patientId: string,
): HandoffDraftAiResult['patients'][number]['sections'] {
  const rawSections = readArray(value);
  if (rawSections.length !== HANDOFF_CLINICAL_SECTIONS.length) {
    invalidResponse();
  }
  const seen = new Set<HandoffClinicalSection>();
  const sections = rawSections.map((raw) => {
    const section = readObject(raw);
    assertExactKeys(section, ['section', 'content', 'citations']);
    const sectionName = readClinicalSection(section.section);
    if (seen.has(sectionName)) invalidResponse();
    seen.add(sectionName);
    const citations = parseEvidenceArray(section.citations, registry, true);
    if (citations.some((citation) => citation.patientId !== patientId)) {
      invalidResponse();
    }
    return {
      section: sectionName,
      content: readBoundedString(section.content, 5000),
      citations,
    };
  });
  if (HANDOFF_CLINICAL_SECTIONS.some((section) => !seen.has(section))) {
    invalidResponse();
  }
  return sections;
}

type UnverifiedItem = {
  patientId: string;
  evidence: readonly HandoffDraftAiEvidenceReference[];
};

function buildUnverifiedItemRegistry(
  items: readonly HandoffDraftAiPrecheckItemInput[],
  registry: SnapshotRegistry,
): ReadonlyMap<string, UnverifiedItem> {
  const result = new Map<string, UnverifiedItem>();
  const allIds = new Set<string>();
  for (const item of items) {
    if (!isUUID(item.id) || allIds.has(item.id)) invalidResponse();
    allIds.add(item.id);
    const evidence = item.evidence.map((reference) =>
      validateTrustedEvidence(reference, registry),
    );
    const patientIds = new Set(evidence.map(({ patientId }) => patientId));
    if (evidence.length === 0 || patientIds.size !== 1) invalidResponse();
    if (item.answer === 'UNVERIFIED') {
      result.set(item.id, { patientId: [...patientIds][0]!, evidence });
    }
  }
  return result;
}

function parseWarnings(
  value: unknown,
  registry: SnapshotRegistry,
  unverifiedItems: ReadonlyMap<string, UnverifiedItem>,
  includeUnverified: boolean,
): HandoffDraftAiResult['warnings'] {
  const rawWarnings = readArray(value);
  assertCollectionSize(rawWarnings);
  if (!includeUnverified && rawWarnings.length !== 0) invalidResponse();
  const seen = new Set<string>();
  const warnings = rawWarnings.map((raw) => {
    const warning = readObject(raw);
    assertExactKeys(warning, [
      'code',
      'itemId',
      'patientId',
      'message',
      'evidence',
    ]);
    if (warning.code !== 'UNVERIFIED_INFORMATION') invalidResponse();
    const itemId = readUuid(warning.itemId);
    const expected = unverifiedItems.get(itemId);
    if (!expected || seen.has(itemId)) invalidResponse();
    seen.add(itemId);
    const patientId = readUuid(warning.patientId);
    const evidence = parseEvidenceArray(warning.evidence, registry);
    if (
      patientId !== expected.patientId ||
      !haveSameEvidence(evidence, expected.evidence)
    ) {
      invalidResponse();
    }
    return {
      code: 'UNVERIFIED_INFORMATION' as const,
      itemId,
      patientId,
      message: readBoundedString(warning.message, 1000),
      evidence,
    };
  });
  if (
    includeUnverified &&
    (warnings.length !== unverifiedItems.size ||
      [...unverifiedItems.keys()].some((itemId) => !seen.has(itemId)))
  ) {
    invalidResponse();
  }
  return warnings;
}

function buildSnapshotRegistry(
  patients: readonly HandoffDraftAiPatientInput[],
): SnapshotRegistry {
  const patientIds = new Set<string>();
  const sources = new Map<string, SnapshotSource>();
  for (const patient of patients) {
    if (!isUUID(patient.patientId) || patientIds.has(patient.patientId)) {
      invalidResponse();
    }
    patientIds.add(patient.patientId);
    for (const event of patient.timelineEvents) {
      addSource(sources, {
        sourceType: 'TIMELINE_EVENT',
        sourceId: event.id,
        patientId: patient.patientId,
      });
    }
    for (const task of patient.tasks) {
      addSource(sources, {
        sourceType: 'TASK',
        sourceId: task.id,
        patientId: patient.patientId,
      });
    }
  }
  return { patientIds, sources };
}

function addSource(
  sources: Map<string, SnapshotSource>,
  source: SnapshotSource,
): void {
  if (!isUUID(source.sourceId)) invalidResponse();
  const key = sourceKey(source.sourceType, source.sourceId);
  if (sources.has(key)) invalidResponse();
  sources.set(key, source);
}

function parseEvidenceArray(
  value: unknown,
  registry: SnapshotRegistry,
  allowEmpty = false,
): readonly HandoffDraftAiEvidenceReference[] {
  const rawEvidence = readArray(value);
  assertCollectionSize(rawEvidence);
  if (!allowEmpty && rawEvidence.length === 0) invalidResponse();
  const seen = new Set<string>();
  return rawEvidence.map((raw) => {
    const reference = readObject(raw);
    assertExactKeys(reference, ['sourceType', 'sourceId', 'patientId']);
    const parsed = validateTrustedEvidence(
      {
        sourceType: readSourceType(reference.sourceType),
        sourceId: readUuid(reference.sourceId),
        patientId: readUuid(reference.patientId),
      },
      registry,
    );
    const key = evidenceKey(parsed);
    if (seen.has(key)) invalidResponse();
    seen.add(key);
    return parsed;
  });
}

function validateTrustedEvidence(
  reference: HandoffDraftAiEvidenceReference,
  registry: SnapshotRegistry,
): HandoffDraftAiEvidenceReference {
  const expected = registry.sources.get(
    sourceKey(reference.sourceType, reference.sourceId),
  );
  if (!expected || expected.patientId !== reference.patientId) {
    invalidResponse();
  }
  return expected;
}

function haveSameEvidence(
  actual: readonly HandoffDraftAiEvidenceReference[],
  expected: readonly HandoffDraftAiEvidenceReference[],
): boolean {
  if (actual.length !== expected.length) return false;
  const actualKeys = new Set(actual.map(evidenceKey));
  return expected.every((reference) => actualKeys.has(evidenceKey(reference)));
}

function evidenceKey(reference: HandoffDraftAiEvidenceReference): string {
  return `${reference.sourceType}:${reference.sourceId}:${reference.patientId}`;
}

function sourceKey(type: 'TIMELINE_EVENT' | 'TASK', id: string): string {
  return `${type}:${id}`;
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
    [...value].some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code <= 31 || code === 127);
    })
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

function readSourceType(value: unknown): 'TIMELINE_EVENT' | 'TASK' {
  if (value !== 'TIMELINE_EVENT' && value !== 'TASK') invalidResponse();
  return value;
}

function readClinicalSection(value: unknown): HandoffClinicalSection {
  if (
    typeof value !== 'string' ||
    !HANDOFF_CLINICAL_SECTIONS.includes(value as HandoffClinicalSection)
  ) {
    invalidResponse();
  }
  return value as HandoffClinicalSection;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalidResponse();
  }
}

function assertCollectionSize(values: readonly unknown[]): void {
  if (values.length > MAX_COLLECTION_SIZE) invalidResponse();
}

function invalidResponse(): never {
  throw new HandoffAiGatewayError('HANDOFF_AI_INVALID_RESPONSE');
}
