import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type { QuickNoteEvidenceStatus, QuickNoteSourceType, QuickNoteType } from '../../domain/quick-note.types';

export type QuickNoteAttachmentReadModel = {
  id: string;
  kind: 'AUDIO' | 'PHOTO';
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  checksum: string;
  createdAt: Date;
};

export type QuickNoteView = {
  id: string;
  patientId: string;
  noteType: QuickNoteType;
  sourceType: QuickNoteSourceType;
  text: string | null;
  occurredAt: Date;
  keywordCandidates: string[];
  evidenceStatus: QuickNoteEvidenceStatus;
  audioFile: QuickNoteAttachmentReadModel | null;
  photoFiles: QuickNoteAttachmentReadModel[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateQuickNoteInput = {
  context: DemoSessionContext;
  patientId: string;
  noteType: QuickNoteType;
  text: string | null;
  occurredAt: Date;
  audioFile: QuickNoteAttachmentReadModel | null;
  photoFiles: readonly QuickNoteAttachmentReadModel[];
  keywordCandidates: readonly string[];
};

export const QUICK_NOTE_REPOSITORY = Symbol('QUICK_NOTE_REPOSITORY');

export interface QuickNoteRepository {
  isAccessiblePatient(input: {
    context: DemoSessionContext;
    patientId: string;
    now: Date;
  }): Promise<boolean>;
  findStoredFiles(input: {
    context: DemoSessionContext;
    ids: readonly string[];
    kind: 'AUDIO' | 'PHOTO';
  }): Promise<readonly QuickNoteAttachmentReadModel[]>;
  create(input: CreateQuickNoteInput): Promise<QuickNoteView>;
}
