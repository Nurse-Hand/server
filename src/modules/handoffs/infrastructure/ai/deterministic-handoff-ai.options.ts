import { HandoffAiGatewayError } from '../../application/ports/handoff-ai-failure';

export const DETERMINISTIC_HANDOFF_AI_SCENARIOS = [
  'SUCCESS',
  'TIMEOUT',
  'RATE_LIMIT',
  'INVALID_RESPONSE',
  'UNAVAILABLE',
] as const;

export type DeterministicHandoffAiScenario =
  (typeof DETERMINISTIC_HANDOFF_AI_SCENARIOS)[number];

export type DeterministicHandoffAiOptions = {
  scenario?: DeterministicHandoffAiScenario;
  generatedAt?: Date;
  modelVersion?: string;
  contractVersion?: string;
};

export const DEFAULT_DETERMINISTIC_GENERATED_AT = new Date(
  '2026-01-01T00:00:00.000Z',
);

export function throwForDeterministicScenario(
  scenario: DeterministicHandoffAiScenario,
): void {
  switch (scenario) {
    case 'SUCCESS':
    case 'INVALID_RESPONSE':
      return;
    case 'TIMEOUT':
      throw new HandoffAiGatewayError('HANDOFF_AI_TIMEOUT');
    case 'RATE_LIMIT':
      throw new HandoffAiGatewayError('HANDOFF_AI_RATE_LIMITED');
    case 'UNAVAILABLE':
      throw new HandoffAiGatewayError('HANDOFF_AI_UNAVAILABLE');
  }
}
