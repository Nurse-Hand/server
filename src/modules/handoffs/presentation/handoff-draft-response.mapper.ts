import type {
  HandoffDraftDetail,
  HandoffDraftListResult,
  HandoffDraftSection,
  HandoffPatientDraft,
} from '../application/handoff-draft.models';
import type { HandoffClinicalSection } from '../domain/handoff.constants';
import type {
  HandoffDraftDetailDataDto,
  HandoffDraftListItemDto,
  UpdatedHandoffDraftDataDto,
} from './handoff-draft.dto';

export function toHandoffDraftListItems(
  result: HandoffDraftListResult,
): HandoffDraftListItemDto[] {
  return result.items.map((item) => ({
    ...item,
    updatedAt: item.updatedAt.toISOString(),
  }));
}

export function toHandoffDraftDetailData(
  detail: HandoffDraftDetail,
): HandoffDraftDetailDataDto {
  return {
    handoffId: detail.handoffId,
    status: detail.status,
    version: detail.version,
    date: detail.date,
    senderActorId: detail.senderActorId,
    receiverActorId: detail.receiverActorId,
    generationJob: {
      jobId: detail.generationJob.jobId,
      status: detail.generationJob.status,
      failureCode: detail.generationJob.failureCode,
      retryable: detail.generationJob.retryable,
    },
    ...(detail.draft === null
      ? {}
      : {
          templateId: detail.draft.templateId,
          includeUnverified: detail.draft.includeUnverified,
          patients: detail.draft.patients.map((patient) =>
            toPatient(patient, detail.draft!.warnings),
          ),
          tasks: detail.draft.tasks.map((task) => ({
            taskId: task.id,
            patientId: task.patientId,
            title: task.title,
            dueAt: task.dueAt?.toISOString() ?? null,
            effectivePriority: task.effectivePriority,
            version: task.version,
          })),
          warnings: detail.draft.warnings.map((warning) => ({
            itemId: warning.itemId,
            severity: warning.severity,
            answer: warning.answer,
            message: warning.question,
            isIncludedInAiInput: warning.isIncludedInAiInput,
          })),
        }),
    updatedAt: detail.updatedAt.toISOString(),
  };
}

export function toUpdatedHandoffDraftData(result: {
  handoffId: string;
  status: 'DRAFT';
  version: number;
  updatedAt: Date;
}): UpdatedHandoffDraftDataDto {
  return { ...result, updatedAt: result.updatedAt.toISOString() };
}

function toPatient(
  patient: HandoffPatientDraft,
  warnings: readonly { patientId: string; answer: string | null }[],
) {
  const sections = readSections(patient);
  return {
    patientId: patient.patientId,
    sections: toSectionValues(sections, 'currentContent'),
    aiOriginalSections: toSectionValues(sections, 'aiOriginalContent'),
    citations: patient.sections.flatMap((section) =>
      section.citations.map((citation) => ({
        sourceType: citation.sourceType,
        sourceId: citation.sourceId,
        sourceReference: citation.sourceReference,
        occurredAt: citation.occurredAt?.toISOString() ?? null,
        excerptKind:
          citation.sourceType === 'TASK'
            ? ('TASK_TITLE' as const)
            : ('SUMMARY' as const),
        excerpt: citation.excerpt,
        section: section.section,
        wasModified: section.isModified,
      })),
    ),
    unverified: warnings.some(
      (warning) =>
        warning.patientId === patient.patientId &&
        warning.answer === 'UNVERIFIED',
    ),
  };
}

function toSectionValues(
  sections: Record<HandoffClinicalSection, HandoffDraftSection>,
  key: 'currentContent' | 'aiOriginalContent',
) {
  return {
    vitalSigns: sections.VITAL_SIGNS[key],
    respiration: sections.RESPIRATION[key],
    mentalStatus: sections.MENTAL_STATUS[key],
    pain: sections.PAIN[key],
    treatment: sections.TREATMENT[key],
    diet: sections.DIET[key],
    observation: sections.OBSERVATION[key],
  };
}

function readSections(
  patient: HandoffPatientDraft,
): Record<HandoffClinicalSection, HandoffDraftSection> {
  return {
    VITAL_SIGNS: requireSection(patient, 'VITAL_SIGNS'),
    RESPIRATION: requireSection(patient, 'RESPIRATION'),
    MENTAL_STATUS: requireSection(patient, 'MENTAL_STATUS'),
    PAIN: requireSection(patient, 'PAIN'),
    TREATMENT: requireSection(patient, 'TREATMENT'),
    DIET: requireSection(patient, 'DIET'),
    OBSERVATION: requireSection(patient, 'OBSERVATION'),
  };
}

function requireSection(
  patient: HandoffPatientDraft,
  section: HandoffClinicalSection,
): HandoffDraftSection {
  const found = patient.sections.find(
    (candidate) => candidate.section === section,
  );
  if (!found) throw new Error('HANDOFF_SECTION_MISSING');
  return found;
}
