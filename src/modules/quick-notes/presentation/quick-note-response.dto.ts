import { ApiProperty } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type {
  QuickNoteAttachmentReadModel,
  QuickNoteView,
} from '../application/ports/quick-note.repository';
import {
  QUICK_NOTE_EVIDENCE_STATUSES,
  QUICK_NOTE_SOURCE_TYPES,
  QUICK_NOTE_TYPES,
} from '../domain/quick-note.types';

export class QuickNoteAttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['AUDIO', 'PHOTO'] })
  kind!: 'AUDIO' | 'PHOTO';

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  originalName!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  checksum!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class QuickNoteDataDto {
  @ApiProperty({ format: 'uuid' })
  quickNoteId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ enum: QUICK_NOTE_TYPES })
  noteType!: (typeof QUICK_NOTE_TYPES)[number];

  @ApiProperty({ enum: QUICK_NOTE_SOURCE_TYPES })
  sourceType!: (typeof QUICK_NOTE_SOURCE_TYPES)[number];

  @ApiProperty({ nullable: true, type: String })
  text!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ enum: QUICK_NOTE_EVIDENCE_STATUSES })
  evidenceStatus!: (typeof QUICK_NOTE_EVIDENCE_STATUSES)[number];

  @ApiProperty({ type: String, isArray: true })
  keywordCandidates!: string[];

  @ApiProperty({ type: QuickNoteAttachmentDto, nullable: true })
  audioFile!: QuickNoteAttachmentDto | null;

  @ApiProperty({ type: QuickNoteAttachmentDto, isArray: true })
  photoFiles!: QuickNoteAttachmentDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class QuickNoteResponseDto {
  @ApiProperty({ type: QuickNoteDataDto })
  data!: QuickNoteDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function toQuickNoteDataDto(quickNote: QuickNoteView): QuickNoteDataDto {
  return {
    quickNoteId: quickNote.id,
    patientId: quickNote.patientId,
    noteType: quickNote.noteType,
    sourceType: quickNote.sourceType,
    text: quickNote.text,
    occurredAt: quickNote.occurredAt.toISOString(),
    evidenceStatus: quickNote.evidenceStatus,
    keywordCandidates: [...quickNote.keywordCandidates],
    audioFile:
      quickNote.audioFile === null ? null : toQuickNoteAttachmentDto(quickNote.audioFile),
    photoFiles: quickNote.photoFiles.map(toQuickNoteAttachmentDto),
    createdAt: quickNote.createdAt.toISOString(),
    updatedAt: quickNote.updatedAt.toISOString(),
  };
}

function toQuickNoteAttachmentDto(
  attachment: QuickNoteAttachmentReadModel,
): QuickNoteAttachmentDto {
  return {
    id: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    checksum: attachment.checksum,
    createdAt: attachment.createdAt.toISOString(),
  };
}
