import type { HandoffDraftAiGateway } from '../../application/ports/handoff-draft-ai.gateway';
import type { HandoffDraftAiInput } from '../../application/ports/handoff-draft-ai.gateway';
import {
  type HandoffDraftAiResult,
  type HandoffDraftAiEvidenceReference,
} from '../../application/ports/handoff-draft-ai.types';
import {
  HANDOFF_CLINICAL_SECTIONS,
  type HandoffClinicalSection,
} from '../../domain/handoff.constants';
import {
  DEFAULT_DETERMINISTIC_GENERATED_AT,
  type DeterministicHandoffAiOptions,
  throwForDeterministicScenario,
} from './deterministic-handoff-ai.options';
import { parseHandoffDraftAiResponse } from './handoff-draft-ai-response.parser';

const DEFAULT_MODEL_VERSION = 'deterministic-handoff-draft-v1';
const DEFAULT_CONTRACT_VERSION = 'handoff-draft-v1';

export class DeterministicHandoffDraftAiGateway implements HandoffDraftAiGateway {
  constructor(private readonly options: DeterministicHandoffAiOptions = {}) {}

  async generate(input: HandoffDraftAiInput): Promise<HandoffDraftAiResult> {
    const scenario = this.options.scenario ?? 'SUCCESS';
    throwForDeterministicScenario(scenario);
    const unverifiedItems = input.precheckItems
      .filter(({ answer }) => answer === 'UNVERIFIED')
      .sort((left, right) => left.id.localeCompare(right.id));
    const response = {
      requestId:
        scenario === 'INVALID_RESPONSE'
          ? '00000000-0000-4000-8000-000000000999'
          : input.requestId,
      modelVersion: this.options.modelVersion ?? DEFAULT_MODEL_VERSION,
      contractVersion: this.options.contractVersion ?? DEFAULT_CONTRACT_VERSION,
      generatedAt: (
        this.options.generatedAt ?? DEFAULT_DETERMINISTIC_GENERATED_AT
      ).toISOString(),
      patients: [...input.patients]
        .sort((left, right) => left.patientId.localeCompare(right.patientId))
        .map((patient) => {
          const evidence = collectPatientEvidence(patient);
          const patientUnverifiedCount = unverifiedItems.filter((item) =>
            item.evidence.some(
              (reference) => reference.patientId === patient.patientId,
            ),
          ).length;

          return {
            patientId: patient.patientId,
            sections: HANDOFF_CLINICAL_SECTIONS.map((section, index) => ({
              section,
              content: createSectionContent(
                section,
                evidence.length,
                input.includeUnverified ? patientUnverifiedCount : 0,
              ),
              citations:
                evidence.length === 0
                  ? []
                  : [evidence[index % evidence.length]],
            })),
          };
        }),
      warnings: input.includeUnverified
        ? unverifiedItems.map((item) => ({
            code: 'UNVERIFIED_INFORMATION' as const,
            itemId: item.id,
            patientId: item.evidence[0]?.patientId,
            message: '확인되지 않은 정보이므로 수신자가 재확인해야 합니다.',
            evidence: item.evidence,
          }))
        : [],
    };

    return parseHandoffDraftAiResponse(response, input);
  }
}

function collectPatientEvidence(
  patient: HandoffDraftAiInput['patients'][number],
): readonly HandoffDraftAiEvidenceReference[] {
  return [
    ...[...patient.timelineEvents]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((event) => ({
        sourceType: 'TIMELINE_EVENT' as const,
        sourceId: event.id,
        patientId: patient.patientId,
      })),
    ...[...patient.tasks]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((task) => ({
        sourceType: 'TASK' as const,
        sourceId: task.id,
        patientId: patient.patientId,
      })),
  ];
}

function createSectionContent(
  section: HandoffClinicalSection,
  evidenceCount: number,
  unverifiedCount: number,
): string {
  const prefix: Readonly<Record<HandoffClinicalSection, string>> = {
    PATIENT_STATUS: '현재 환자 상태',
    PAIN: '통증 상태',
    TREATMENT: '치료 및 투약',
    DIET: '식이 및 섭취',
    ACTIVITY: '활동 및 이동',
    OBSERVATION: '다음 근무의 관찰 사항',
  };
  const warning =
    unverifiedCount > 0
      ? ` 확인되지 않은 정보 ${unverifiedCount}건은 별도 경고로 표시합니다.`
      : '';

  return `${prefix[section]}: 해당 환자의 입력 근거 ${evidenceCount}건을 기준으로 생성한 초안입니다.${warning}`;
}
