import type {
  HandoffDraftAiPatientInput,
  HandoffDraftAiResult,
  HandoffDraftAiPrecheckItemInput,
} from './handoff-draft-ai.types';

export const HANDOFF_DRAFT_AI_GATEWAY = Symbol('HANDOFF_DRAFT_AI_GATEWAY');

export type HandoffDraftAiInput = {
  requestId: string;
  templateId: 'NURSING_HANDOFF_V1';
  includeUnverified: boolean;
  patients: readonly HandoffDraftAiPatientInput[];
  precheckItems: readonly HandoffDraftAiPrecheckItemInput[];
};

export interface HandoffDraftAiGateway {
  generate(input: HandoffDraftAiInput): Promise<HandoffDraftAiResult>;
}
