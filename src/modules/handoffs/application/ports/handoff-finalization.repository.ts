import type {
  FinalizeHandoffCommand,
  FinalizedHandoff,
} from '../handoff-finalization.models';

export const HANDOFF_FINALIZATION_REPOSITORY = Symbol(
  'HANDOFF_FINALIZATION_REPOSITORY',
);

export interface HandoffFinalizationRepository {
  finalize(input: FinalizeHandoffCommand): Promise<FinalizedHandoff>;
}
