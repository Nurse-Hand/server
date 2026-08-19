import type { DemoSessionContext } from '../../../demo/application/demo-session-context';

export const ROUNDING_SESSION_QUERY_PORT = Symbol(
  'ROUNDING_SESSION_QUERY_PORT',
);

export interface RoundingSessionQueryPort {
  assertCompleted(input: {
    context: DemoSessionContext;
    roundingSessionId: string;
    recordIds: readonly string[];
  }): Promise<void>;
}
