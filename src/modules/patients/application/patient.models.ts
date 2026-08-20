import type { TimelineEventReadModel } from '../../timeline/application/ports/timeline-reader';

export type PatientReadModel = {
  patientId: string;
  displayName: string;
  roomLabel: string;
  patientCode: string | null;
  statusLabel: string | null;
  department: string | null;
  admittedAt: Date | null;
  baselineSummary: string | null;
  createdAt: Date;
};

export type PatientTimelineReadModel = TimelineEventReadModel;

export type PatientTimelineReadResult = {
  patient: PatientReadModel;
  workDate: string | null;
  daySummary: string | null;
  items: readonly PatientTimelineReadModel[];
};
