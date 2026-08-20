import { ApiProperty } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type {
  QuickNoteAttachmentReadModel,
  QuickNoteView,
} from '../application/ports/quick-note.repository';
import {
  QUICK_NOTE_EVIDENCE_STATUSES,
  QUICK_NOTE_SOURCE_CHANNELS,
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

export class QuickNoteStructuredFactsDto {
  @ApiProperty({ nullable: true, type: String })
  summary!: string | null;

  @ApiProperty({ nullable: true, type: String })
  text!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ enum: QUICK_NOTE_SOURCE_CHANNELS, isArray: true })
  sourceChannels!: (typeof QUICK_NOTE_SOURCE_CHANNELS)[number][];

  @ApiProperty({ format: 'uuid', nullable: true })
  audioFileId!: string | null;

  @ApiProperty({ type: String, isArray: true })
  photoFileIds!: string[];
}

export class QuickNoteDataDto {
  @ApiProperty({ format: 'uuid' })
  quickNoteId!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ enum: QUICK_NOTE_TYPES })
  noteType!: (typeof QUICK_NOTE_TYPES)[number];

  @ApiProperty({ enum: QUICK_NOTE_TYPES })
  topic!: (typeof QUICK_NOTE_TYPES)[number];

  @ApiProperty()
  handoffSection!: string;

  @ApiProperty({ enum: QUICK_NOTE_SOURCE_TYPES })
  sourceType!: (typeof QUICK_NOTE_SOURCE_TYPES)[number];

  @ApiProperty({ nullable: true, type: String })
  text!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ type: QuickNoteAttachmentDto, nullable: true })
  audioFile!: QuickNoteAttachmentDto | null;

  @ApiProperty({ type: QuickNoteAttachmentDto, isArray: true })
  photoFiles!: QuickNoteAttachmentDto[];

  @ApiProperty({ type: String, isArray: true })
  keywords!: string[];

  @ApiProperty({ enum: QUICK_NOTE_EVIDENCE_STATUSES })
  evidenceStatus!: (typeof QUICK_NOTE_EVIDENCE_STATUSES)[number];

  @ApiProperty({ type: QuickNoteStructuredFactsDto })
  structuredFacts!: QuickNoteStructuredFactsDto;

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
    topic: quickNote.topic,
    handoffSection: quickNote.handoffSection,
    sourceType: quickNote.sourceType,
    text: quickNote.text,
    occurredAt: quickNote.occurredAt.toISOString(),
    audioFile:
      quickNote.audioFile === null ? null : toQuickNoteAttachmentDto(quickNote.audioFile),
    photoFiles: quickNote.photoFiles.map(toQuickNoteAttachmentDto),
    keywords: [...quickNote.keywords],
    evidenceStatus: quickNote.evidenceStatus,
    structuredFacts: {
      summary: quickNote.structuredFacts.summary,
      text: quickNote.structuredFacts.text,
      occurredAt: quickNote.structuredFacts.occurredAt,
      sourceChannels: [...quickNote.structuredFacts.sourceChannels],
      audioFileId: quickNote.structuredFacts.audioFileId,
      photoFileIds: [...quickNote.structuredFacts.photoFileIds],
    },
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
