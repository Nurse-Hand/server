import type { DemoSessionContext } from '../../../demo/application/demo-session-context';
import type {
  QuickNoteEvidenceStatus,
  QuickNoteSourceType,
  QuickNoteStructuredFacts,
  QuickNoteType,
} from '../../domain/quick-note.types';

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
  topic: QuickNoteType;
  handoffSection: string;
  sourceType: QuickNoteSourceType;
  text: string | null;
  occurredAt: Date;
  keywords: string[];
  structuredFacts: QuickNoteStructuredFacts;
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
  topic: QuickNoteType;
  handoffSection: string;
  audioFile: QuickNoteAttachmentReadModel | null;
  photoFiles: readonly QuickNoteAttachmentReadModel[];
  keywords: readonly string[];
  structuredFacts: QuickNoteStructuredFacts;
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
