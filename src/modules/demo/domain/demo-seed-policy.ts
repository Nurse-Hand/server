import { DemoScenarioNotAllowedError } from './demo-session.errors';

export function assertDemoSeedAllowed(
  nodeEnvironment: string | undefined,
  demoMode: string | undefined,
): void {
  if (
    (nodeEnvironment !== 'development' && nodeEnvironment !== 'test') ||
    demoMode !== 'true'
  ) {
    throw new DemoScenarioNotAllowedError();
  }
}
