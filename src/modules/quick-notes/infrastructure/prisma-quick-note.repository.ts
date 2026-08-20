import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  CreateQuickNoteInput,
  QuickNoteAttachmentReadModel,
  QuickNoteRepository,
  QuickNoteView,
} from '../application/ports/quick-note.repository';

@Injectable()
export class PrismaQuickNoteRepository implements QuickNoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isAccessiblePatient(input: {
    context: DemoSessionContext;
    patientId: string;
    now: Date;
  }): Promise<boolean> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        id: input.patientId,
        patientAssignments: {
          some: {
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
            nurseId: input.context.actorId,
            startsAt: { lte: input.now },
            OR: [{ endsAt: null }, { endsAt: { gte: input.now } }],
          },
        },
      },
      select: { id: true },
    });

    return patient !== null;
  }

  async findStoredFiles(input: {
    context: DemoSessionContext;
    ids: readonly string[];
    kind: 'AUDIO' | 'PHOTO';
  }): Promise<readonly QuickNoteAttachmentReadModel[]> {
    if (input.ids.length === 0) {
      return [];
    }

    const files = await this.prisma.storedFile.findMany({
      where: {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        actorId: input.context.actorId,
        kind: input.kind,
        id: { in: [...input.ids] },
      },
      select: {
        id: true,
        kind: true,
        mimeType: true,
        originalName: true,
        sizeBytes: true,
        checksum: true,
        createdAt: true,
      },
    });

    return files.map((file) => ({
      id: file.id,
      kind: file.kind,
      mimeType: file.mimeType,
      originalName: file.originalName,
      sizeBytes: file.sizeBytes,
      checksum: file.checksum,
      createdAt: file.createdAt,
    }));
  }

  async create(input: CreateQuickNoteInput): Promise<QuickNoteView> {
    const quickNoteId = randomUUID();
    const created = await this.prisma.quickNote.create({
      data: {
        id: quickNoteId,
        datasetId: input.context.datasetId,
        logicalKey: `quick-note:${quickNoteId}`,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        patientId: input.patientId,
        noteType: input.noteType,
        text: input.text,
        occurredAt: input.occurredAt,
        keywordCandidates: [...input.keywordCandidates],
        ...(input.audioFile === null ? {} : { audioFileId: input.audioFile.id }),
        ...(input.photoFiles.length === 0
          ? {}
          : {
              photoLinks: {
                create: input.photoFiles.map((file) => ({
                  datasetId: input.context.datasetId,
                  photoFileId: file.id,
                })),
              },
            }),
      },
      select: {
        id: true,
        patientId: true,
        noteType: true,
        sourceType: true,
        text: true,
        occurredAt: true,
        keywordCandidates: true,
        evidenceStatus: true,
        createdAt: true,
        updatedAt: true,
        audioFile: {
          select: {
            id: true,
            kind: true,
            mimeType: true,
            originalName: true,
            sizeBytes: true,
            checksum: true,
            createdAt: true,
          },
        },
        photoLinks: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            photoFile: {
              select: {
                id: true,
                kind: true,
                mimeType: true,
                originalName: true,
                sizeBytes: true,
                checksum: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    return {
      id: created.id,
      patientId: created.patientId,
      noteType: created.noteType,
      sourceType: created.sourceType,
      text: created.text,
      occurredAt: created.occurredAt,
      keywordCandidates: parseKeywordCandidates(created.keywordCandidates),
      evidenceStatus: created.evidenceStatus,
      audioFile:
        created.audioFile === null ? null : mapAttachment(created.audioFile),
      photoFiles: created.photoLinks.map(({ photoFile }) =>
        mapAttachment(photoFile),
      ),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }
}

function mapAttachment(file: {
  id: string;
  kind: 'AUDIO' | 'PHOTO';
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  checksum: string;
  createdAt: Date;
}): QuickNoteAttachmentReadModel {
  return {
    id: file.id,
    kind: file.kind,
    mimeType: file.mimeType,
    originalName: file.originalName,
    sizeBytes: file.sizeBytes,
    checksum: file.checksum,
    createdAt: file.createdAt,
  };
}

function parseKeywordCandidates(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
