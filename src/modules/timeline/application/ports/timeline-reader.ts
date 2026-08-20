import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type {
  TimelineClinicalCategory,
  TimelineEventConfirmationStatus,
  TimelineEventSource,
  TimelineEventType,
} from '../../domain/timeline.types';

export const TIMELINE_READER = Symbol('TIMELINE_READER');

export type TimelineEventReadModel = {
  id: string;
  patientId: string;
  occurredAt: Date;
  type: TimelineEventType;
  clinicalCategory?: TimelineClinicalCategory | null;
  source: TimelineEventSource;
  summary: string;
  important?: boolean;
  confirmationStatus?: TimelineEventConfirmationStatus;
  version: number;
  sourceReference: string;
  updatedAt?: Date;
  updatedByActorId?: string | null;
};

export type ReadTimelineInput = {
  context: DemoSessionContext;
  patientId: string;
  from?: Date;
  to?: Date;
};

export type ReadTimelinesInput = {
  context: DemoSessionContext;
  patientIds: readonly string[];
  from?: Date;
  to?: Date;
};

export interface TimelineReader {
  read(input: ReadTimelineInput): Promise<readonly TimelineEventReadModel[]>;
  readMany(
    input: ReadTimelinesInput,
  ): Promise<readonly TimelineEventReadModel[]>;
}
