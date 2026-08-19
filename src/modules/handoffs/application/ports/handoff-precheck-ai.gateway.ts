import type {
  HandoffPrecheckAiPatientInput,
  HandoffPrecheckAiResult,
} from './handoff-precheck-ai.types';

export const HANDOFF_PRECHECK_AI_GATEWAY = Symbol(
  'HANDOFF_PRECHECK_AI_GATEWAY',
);

export type HandoffPrecheckAiInput = {
  requestId: string;
  patients: readonly HandoffPrecheckAiPatientInput[];
};

export interface HandoffPrecheckAiGateway {
  analyze(input: HandoffPrecheckAiInput): Promise<HandoffPrecheckAiResult>;
}
