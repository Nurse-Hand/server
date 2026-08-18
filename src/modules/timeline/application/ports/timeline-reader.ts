import type { DemoSessionContext } from '../../../demo/application/demo-session-context';

export const TIMELINE_READER = Symbol('TIMELINE_READER');

export type TimelineEventType =
  'OBSERVATION' | 'MEDICATION' | 'PROCEDURE' | 'REPORT' | 'TASK';

export type TimelineEventSource = 'MANUAL' | 'AI_AUDIO';

export type TimelineEventReadModel = {
  id: string;
  patientId: string;
  occurredAt: Date;
  type: TimelineEventType;
  source: TimelineEventSource;
  summary: string;
  version: number;
  sourceReference: string;
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
