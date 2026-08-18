export const DEMO_SCENARIO_KEYS = ['SYNTHETIC_MEDICAL_DAY_SHIFT'] as const;

export type DemoScenarioKey = (typeof DEMO_SCENARIO_KEYS)[number];

export function isDemoScenarioKey(value: string): value is DemoScenarioKey {
  return DEMO_SCENARIO_KEYS.some((scenarioKey) => scenarioKey === value);
}
