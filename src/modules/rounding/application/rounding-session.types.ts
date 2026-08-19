import type { DemoSessionContext } from '../../demo/application/demo-session-context';

export type RoundingSessionStatus = 'RECORDING' | 'COMPLETED';

export type RoundingPatientSegmentReadModel = {
  id: string;
  patientId: string;
  sequence: number;
  startedAt: Date;
  endedAt: Date;
  note: string | null;
};

export type RoundingSessionReadModel = {
  id: string;
  status: RoundingSessionStatus;
  actorId: string;
  wardId: string;
  startedAt: Date;
  completedAt: Date | null;
  note: string | null;
  version: number;
  segments: readonly RoundingPatientSegmentReadModel[];
};

export type StartRoundingSessionInput = {
  context: DemoSessionContext;
  startedAt?: Date;
  note?: string;
};

export type AddRoundingPatientSegmentInput = {
  context: DemoSessionContext;
  sessionId: string;
  patientId: string;
  startedAt: Date;
  endedAt: Date;
  note?: string;
};

export type CompleteRoundingSessionInput = {
  context: DemoSessionContext;
  sessionId: string;
  completedAt?: Date;
};

export type ReadRoundingSessionInput = {
  context: DemoSessionContext;
  sessionId: string;
};
