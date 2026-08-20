import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type { UploadedFilePayload } from '../../files/application/uploaded-file';

export type RoundingRecordReadModel = {
  id: string;
  sessionId: string;
  patientId: string;
  patientDisplayName: string;
  patientRoomLabel: string;
  actorId: string;
  wardId: string;
  sequence: number;
  workDate: Date;
  startedAt: Date;
  endedAt: Date;
  note: string | null;
  audioFileId: string | null;
  createdAt: Date;
};

export type RoundingRecordListView = {
  date: Date;
  items: readonly RoundingRecordReadModel[];
};

export type RoundingAudioChunkReadModel = {
  id: string;
  sessionId: string;
  audioFileId: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  checksum: string;
  createdAt: Date;
};

export type CreateRoundingRecordInput = {
  context: DemoSessionContext;
  sessionId: string;
  patientId: string;
  startedAt: Date;
  endedAt: Date;
  note?: string;
  audioFileId?: string;
};

export type UploadRoundingAudioChunkInput = {
  context: DemoSessionContext;
  sessionId: string;
  file: UploadedFilePayload | undefined;
};
