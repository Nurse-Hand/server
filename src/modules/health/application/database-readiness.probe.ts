export const DATABASE_READINESS_PROBE = Symbol('DATABASE_READINESS_PROBE');

export interface DatabaseReadinessProbe {
  check(): Promise<void>;
}
