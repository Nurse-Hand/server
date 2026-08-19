import type { HandoffPrecheckAiGateway } from '../../application/ports/handoff-precheck-ai.gateway';
import type { HandoffPrecheckAiInput } from '../../application/ports/handoff-precheck-ai.gateway';
import type {
  HandoffPrecheckAiEvidenceReference,
  HandoffPrecheckAiPatientInput,
  HandoffPrecheckAiResult,
} from '../../application/ports/handoff-precheck-ai.types';
import {
  DEFAULT_DETERMINISTIC_GENERATED_AT,
  type DeterministicHandoffAiOptions,
  throwForDeterministicScenario,
} from './deterministic-handoff-ai.options';
import { parseHandoffPrecheckAiResponse } from './handoff-precheck-ai-response.parser';

const DEFAULT_MODEL_VERSION = 'deterministic-handoff-precheck-v1';
const DEFAULT_CONTRACT_VERSION = 'handoff-precheck-v1';

export class DeterministicHandoffPrecheckAiGateway implements HandoffPrecheckAiGateway {
  constructor(private readonly options: DeterministicHandoffAiOptions = {}) {}

  async analyze(
    input: HandoffPrecheckAiInput,
  ): Promise<HandoffPrecheckAiResult> {
    const scenario = this.options.scenario ?? 'SUCCESS';
    throwForDeterministicScenario(scenario);

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
      questions: [...input.patients]
        .sort((left, right) => left.patientId.localeCompare(right.patientId))
        .flatMap((patient) => createQuestion(patient)),
    };

    return parseHandoffPrecheckAiResponse(response, input);
  }
}

function createQuestion(patient: HandoffPrecheckAiPatientInput) {
  const evidence = selectEvidence(patient);

  if (evidence.length === 0) {
    return [];
  }

  const hasCriticalTask = patient.tasks.some(
    ({ effectivePriority }) => effectivePriority === 'CRITICAL',
  );

  return [
    {
      questionKey: `patient:${patient.patientId}:precheck-v1`,
      patientId: patient.patientId,
      severity: hasCriticalTask
        ? ('CRITICAL' as const)
        : ('RECOMMENDED' as const),
      prompt: hasCriticalTask
        ? '마감이 지난 미완료 업무의 현재 상태를 확인해 주세요.'
        : '최근 기록과 미완료 업무를 인수인계에 포함할지 확인해 주세요.',
      reason: hasCriticalTask
        ? '입력 snapshot에 CRITICAL 우선순위의 미완료 업무가 있습니다.'
        : '입력 snapshot에 인수인계 포함 여부를 확인할 근거가 있습니다.',
      evidence,
    },
  ];
}

function selectEvidence(
  patient: HandoffPrecheckAiPatientInput,
): readonly HandoffPrecheckAiEvidenceReference[] {
  const latestEvent = [...patient.timelineEvents].sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.id.localeCompare(left.id),
  )[0];
  const highestPriorityTask = [...patient.tasks].sort(
    (left, right) =>
      priorityRank(left.effectivePriority) -
        priorityRank(right.effectivePriority) ||
      compareNullableDate(left.dueAt, right.dueAt) ||
      left.id.localeCompare(right.id),
  )[0];

  return [
    ...(latestEvent
      ? [
          {
            sourceType: 'TIMELINE_EVENT' as const,
            sourceId: latestEvent.id,
            patientId: patient.patientId,
          },
        ]
      : []),
    ...(highestPriorityTask
      ? [
          {
            sourceType: 'TASK' as const,
            sourceId: highestPriorityTask.id,
            patientId: patient.patientId,
          },
        ]
      : []),
  ];
}

function priorityRank(priority: 'CRITICAL' | 'HIGH' | 'NORMAL'): number {
  return { CRITICAL: 0, HIGH: 1, NORMAL: 2 }[priority];
}

function compareNullableDate(left: Date | null, right: Date | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.getTime() - right.getTime();
}
