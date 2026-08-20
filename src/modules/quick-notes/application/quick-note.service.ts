import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Clock } from '../../../common/time/clock';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { PatientNotFoundError } from '../../patients/domain/patient.errors';
import { buildQuickNoteStructure } from '../domain/quick-note-structure';
import {
  QuickNoteAttachmentNotFoundError,
  QuickNotePayloadEmptyError,
} from '../domain/quick-note.errors';
import { QUICK_NOTE_TYPES, type QuickNoteType } from '../domain/quick-note.types';
import {
  QUICK_NOTE_REPOSITORY,
  type QuickNoteRepository,
  type QuickNoteView,
} from './ports/quick-note.repository';

type CreateQuickNoteCommand = {
  patientId: string;
  noteType: QuickNoteType;
  text?: string | null;
  occurredAt: string;
  audioFileId?: string;
  photoFileIds?: readonly string[];
};

const NON_WHITESPACE_PATTERN = /\S/;

@Injectable()
export class QuickNoteService {
  constructor(
    @Inject(QUICK_NOTE_REPOSITORY)
    private readonly repository: QuickNoteRepository,
    private readonly clock: Clock,
  ) {}

  async create(
    context: DemoSessionContext,
    command: CreateQuickNoteCommand,
  ): Promise<QuickNoteView> {
    const now = this.clock.now();

    if (
      !isUUID(command.patientId, '4') ||
      !QUICK_NOTE_TYPES.includes(command.noteType)
    ) {
      throw new PatientNotFoundError();
    }

    const patientAccessible = await this.repository.isAccessiblePatient({
      context,
      patientId: command.patientId,
      now,
    });

    if (!patientAccessible) {
      throw new PatientNotFoundError();
    }

    const text = normalizeNullableText(command.text, 2000);
    const occurredAt = new Date(command.occurredAt);
    const photoFileIds = [...(command.photoFileIds ?? [])];

    if (
      text === null &&
      command.audioFileId === undefined &&
      photoFileIds.length === 0
    ) {
      throw new QuickNotePayloadEmptyError();
    }

    const audioFile =
      command.audioFileId === undefined
        ? null
        : await this.requireSingleAttachment(
            context,
            command.audioFileId,
            'AUDIO',
          );
    const photoFiles =
      photoFileIds.length === 0
        ? []
        : await this.requireAttachments(context, photoFileIds, 'PHOTO');
    const structure = buildQuickNoteStructure({
      noteType: command.noteType,
      text,
      occurredAt,
      audioFileId: audioFile?.id ?? null,
      photoFileIds: photoFiles.map((file) => file.id),
    });

    return this.repository.create({
      context,
      patientId: command.patientId,
      noteType: command.noteType,
      text,
      occurredAt,
      topic: structure.topic,
      handoffSection: structure.handoffSection,
      audioFile,
      photoFiles,
      keywords: structure.keywords,
      structuredFacts: structure.structuredFacts,
    });
  }

  private async requireSingleAttachment(
    context: DemoSessionContext,
    id: string,
    kind: 'AUDIO' | 'PHOTO',
  ) {
    const [file] = await this.repository.findStoredFiles({
      context,
      ids: [id],
      kind,
    });

    if (file === undefined) {
      throw new QuickNoteAttachmentNotFoundError(kind);
    }

    return file;
  }

  private async requireAttachments(
    context: DemoSessionContext,
    ids: readonly string[],
    kind: 'AUDIO' | 'PHOTO',
  ) {
    const files = await this.repository.findStoredFiles({
      context,
      ids,
      kind,
    });

    if (files.length !== ids.length) {
      throw new QuickNoteAttachmentNotFoundError(kind);
    }

    const filesById = new Map(files.map((file) => [file.id, file]));
    return ids.map((id) => {
      const file = filesById.get(id);

      if (file === undefined) {
        throw new QuickNoteAttachmentNotFoundError(kind);
      }

      return file;
    });
  }
}

function normalizeNullableText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  if (!NON_WHITESPACE_PATTERN.test(normalized)) {
    return null;
  }

  return normalized.slice(0, maxLength);
}
