import type { FinalizedHandoff } from '../application/handoff-finalization.models';
import type { FinalizedHandoffDataDto } from './handoff-finalization.dto';

export function toFinalizedHandoffData(
  result: FinalizedHandoff,
): FinalizedHandoffDataDto {
  return { ...result, finalizedAt: result.finalizedAt.toISOString() };
}
