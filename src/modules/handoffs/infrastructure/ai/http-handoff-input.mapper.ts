import type {
  HandoffDraftAiPatientInput,
  HandoffDraftAiPrecheckItemInput,
} from '../../application/ports/handoff-draft-ai.types';
import type { HandoffPrecheckAiPatientInput } from '../../application/ports/handoff-precheck-ai.types';
import {
  type HandoffClinicalSection,
  type HandoffSourceType,
} from '../../domain/handoff.constants';
import type {
  HttpHandoffEvidencePayload,
  HttpHandoffGenerateOpenTaskPayload,
  HttpHandoffPrecheckOpenTaskPayload,
} from './http-handoff-ai.client';

export const HTTP_HANDOFF_DRAFT_MODEL_VERSION = 'http-handoff-generate-v1';
export const HTTP_HANDOFF_PRECHECK_MODEL_VERSION = 'http-handoff-precheck-v1';
export const HTTP_HANDOFF_DRAFT_CONTRACT_VERSION = 'handoffs-generate-v1';
export const HTTP_HANDOFF_PRECHECK_CONTRACT_VERSION = 'handoffs-precheck-v1';

const DEFAULT_ROUNDING_SESSION_ID = '00000000-0000-4000-8000-000000000000';

export type HandoffAiSourceReference = {
  sourceType: HandoffSourceType;
  sourceId: string;
  patientId: string;
};

export function toHttpEvidencePayloads(
  patient: HandoffDraftAiPatientInput | HandoffPrecheckAiPatientInput,
): readonly HttpHandoffEvidencePayload[] {
  return patient.timelineEvents.map((event) => {
    const topic = classifyTopic(event.summary);
    return {
      evidenceId: event.id,
      topic,
      handoffSection: handoffSectionOf(topic),
      text: event.summary,
      structuredFacts: {
        sourceReference: event.sourceReference,
        eventType: event.type,
        occurredAt: event.occurredAt.toISOString(),
      },
      importanceFlags: [],
      requiresNurseConfirmation: false,
    };
  });
}

export function toHttpGenerateOpenTasks(
  patient: HandoffDraftAiPatientInput | HandoffPrecheckAiPatientInput,
): readonly HttpHandoffGenerateOpenTaskPayload[] {
  return patient.tasks.map((task) => ({
    taskId: task.id,
    patientId: patient.patientId,
    title: task.title,
    dueAt: task.dueAt?.toISOString() ?? null,
    carriedOver: false,
  }));
}

export function toHttpPrecheckOpenTasks(
  patient: HandoffDraftAiPatientInput | HandoffPrecheckAiPatientInput,
): readonly HttpHandoffPrecheckOpenTaskPayload[] {
  return patient.tasks.map((task) => ({
    taskId: task.id,
    patientId: patient.patientId,
    title: task.title,
    status: 'TODO',
    dueAt: task.dueAt?.toISOString() ?? null,
    effectivePriority: task.effectivePriority,
  }));
}

export function createSourceReferenceResolver(
  patient: HandoffDraftAiPatientInput | HandoffPrecheckAiPatientInput,
): (input: {
  evidenceIds?: readonly string[];
  taskIds?: readonly string[];
}) => readonly HandoffAiSourceReference[] {
  const eventIds = new Set(patient.timelineEvents.map(({ id }) => id));
  const taskIds = new Set(patient.tasks.map(({ id }) => id));

  return (input) => {
    const references: HandoffAiSourceReference[] = [];
    for (const evidenceId of input.evidenceIds ?? []) {
      if (!eventIds.has(evidenceId)) continue;
      references.push({
        sourceType: 'TIMELINE_EVENT',
        sourceId: evidenceId,
        patientId: patient.patientId,
      });
    }
    for (const taskId of input.taskIds ?? []) {
      if (!taskIds.has(taskId)) continue;
      references.push({
        sourceType: 'TASK',
        sourceId: taskId,
        patientId: patient.patientId,
      });
    }
    return uniqueReferences(references);
  };
}

export function fallbackSourceReferences(
  patient: HandoffDraftAiPatientInput | HandoffPrecheckAiPatientInput,
): readonly HandoffAiSourceReference[] {
  const latestEvent = [...patient.timelineEvents].sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.id.localeCompare(left.id),
  )[0];
  if (latestEvent) {
    return [
      {
        sourceType: 'TIMELINE_EVENT',
        sourceId: latestEvent.id,
        patientId: patient.patientId,
      },
    ];
  }

  const firstTask = [...patient.tasks].sort((left, right) =>
    left.id.localeCompare(right.id),
  )[0];
  if (!firstTask) return [];
  return [
    {
      sourceType: 'TASK',
      sourceId: firstTask.id,
      patientId: patient.patientId,
    },
  ];
}

export function toDraftPrecheckItems(
  input: readonly HandoffDraftAiPrecheckItemInput[],
  includeUnverified: boolean,
): readonly HandoffDraftAiPrecheckItemInput[] {
  return input.filter(
    (item) => includeUnverified || item.answer !== 'UNVERIFIED',
  );
}

export function roundingSessionIdForRequest(requestId: string): string {
  return requestId || DEFAULT_ROUNDING_SESSION_ID;
}

export function handoffSectionOf(topic: HandoffClinicalSection): string {
  return {
    VITAL_SIGNS: '활력징후',
    RESPIRATION: '호흡',
    MENTAL_STATUS: '의식상태',
    PAIN: '통증',
    TREATMENT: '처치',
    DIET: '식이',
    OBSERVATION: '관찰사항·특이사항',
  }[topic];
}

function classifyTopic(text: string): HandoffClinicalSection {
  if (/(혈압|맥박|체온|열|산소포화도|spo2|산소)/i.test(text)) {
    return 'VITAL_SIGNS';
  }
  if (/(기침|가래|호흡|숨|산소|네뷸라이저)/i.test(text)) {
    return 'RESPIRATION';
  }
  if (/(의식|혼돈|졸림|섬망|반응)/i.test(text)) {
    return 'MENTAL_STATUS';
  }
  if (/(통증|아파|nrs|쑤심|찌릿|욱신)/i.test(text)) {
    return 'PAIN';
  }
  if (/(처치|드레싱|dressing|suction|도뇨|배액|검사|시술|투여)/i.test(text)) {
    return 'TREATMENT';
  }
  if (/(식사|섭취|금식|npo|연하|구토|intake)/i.test(text)) {
    return 'DIET';
  }
  return 'OBSERVATION';
}

function uniqueReferences(
  references: readonly HandoffAiSourceReference[],
): readonly HandoffAiSourceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.sourceType}:${reference.sourceId}:${reference.patientId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
