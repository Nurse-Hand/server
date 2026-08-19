export const HANDOFF_AI_FAILURE_CODES = [
  'HANDOFF_AI_TIMEOUT',
  'HANDOFF_AI_RATE_LIMITED',
  'HANDOFF_AI_INVALID_RESPONSE',
  'HANDOFF_AI_UNAVAILABLE',
] as const;

export type HandoffAiFailureCode = (typeof HANDOFF_AI_FAILURE_CODES)[number];

export type HandoffAiFailure = {
  code: HandoffAiFailureCode;
  retryable: boolean;
};

const RETRYABLE_FAILURE_CODES: ReadonlySet<HandoffAiFailureCode> = new Set([
  'HANDOFF_AI_TIMEOUT',
  'HANDOFF_AI_RATE_LIMITED',
  'HANDOFF_AI_UNAVAILABLE',
]);

export class HandoffAiGatewayError extends Error {
  readonly code: HandoffAiFailureCode;
  readonly retryable: boolean;

  constructor(code: HandoffAiFailureCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = HandoffAiGatewayError.name;
    this.code = code;
    this.retryable = RETRYABLE_FAILURE_CODES.has(code);
  }
}

export function classifyHandoffAiFailure(error: unknown): HandoffAiFailure {
  if (error instanceof HandoffAiGatewayError) {
    return { code: error.code, retryable: error.retryable };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'HANDOFF_AI_RESULT_INVALID'
  ) {
    return { code: 'HANDOFF_AI_INVALID_RESPONSE', retryable: false };
  }

  return { code: 'HANDOFF_AI_UNAVAILABLE', retryable: true };
}
