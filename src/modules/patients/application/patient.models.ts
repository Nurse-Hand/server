import type { TimelineEventReadModel } from '../../timeline/application/ports/timeline-reader';

export type PatientReadModel = {
  patientId: string;
  displayName: string;
  roomLabel: string;
  statusLabel: string | null;
  department: string | null;
  admittedAt: Date | null;
  baselineSummary: string | null;
  createdAt: Date;
};

export type PatientTimelineReadModel = TimelineEventReadModel;
