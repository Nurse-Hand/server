import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import type {
  CreateQuickNoteInput,
  QuickNoteAttachmentReadModel,
  QuickNoteRepository,
  QuickNoteView,
} from '../application/ports/quick-note.repository';
import type { QuickNoteStructuredFacts } from '../domain/quick-note.types';

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
    const hasTextEvidence = input.text !== null;
    const created = await this.prisma.$transaction(async (transaction) => {
      const note = await transaction.quickNote.create({
        data: {
          id: quickNoteId,
          datasetId: input.context.datasetId,
          logicalKey: `quick-note:${quickNoteId}`,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          patientId: input.patientId,
          noteType: input.noteType,
          topic: input.topic,
          handoffSection: input.handoffSection,
          text: input.text,
          occurredAt: input.occurredAt,
          keywords: [...input.keywords],
          structuredFacts: input.structuredFacts,
          evidenceStatus: hasTextEvidence ? 'CONVERTED' : 'PENDING',
          ...(input.audioFile === null
            ? {}
            : { audioFileId: input.audioFile.id }),
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
        select: quickNoteSelect,
      });

      if (hasTextEvidence) {
        await transaction.timelineEvent.create({
          data: {
            datasetId: input.context.datasetId,
            logicalKey: `quick-note:${quickNoteId}`,
            patientId: input.patientId,
            wardId: input.context.wardId,
            occurredAt: input.occurredAt,
            type: 'OBSERVATION',
            source: 'MANUAL',
            sourceReference: `quick-note:${quickNoteId}`,
            summary: input.structuredFacts.summary ?? input.text ?? '',
            confirmationStatus: 'CONFIRMED',
            updatedByActorId: input.context.actorId,
          },
        });
      }

      return note;
    });

    return {
      id: created.id,
      patientId: created.patientId,
      noteType: created.noteType,
      topic: created.topic,
      handoffSection: created.handoffSection,
      sourceType: created.sourceType,
      text: created.text,
      occurredAt: created.occurredAt,
      keywords: [...created.keywords],
      structuredFacts: parseStructuredFacts(created.structuredFacts),
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

const quickNoteSelect = {
  id: true,
  patientId: true,
  noteType: true,
  topic: true,
  handoffSection: true,
  sourceType: true,
  text: true,
  occurredAt: true,
  keywords: true,
  structuredFacts: true,
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
} satisfies Prisma.QuickNoteSelect;

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

function parseStructuredFacts(value: unknown): QuickNoteStructuredFacts {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('occurredAt' in value) ||
    !('sourceChannels' in value) ||
    !('photoFileIds' in value)
  ) {
    return {
      summary: null,
      text: null,
      occurredAt: '',
      sourceChannels: [],
      audioFileId: null,
      photoFileIds: [],
    };
  }

  const candidate = value as {
    summary?: unknown;
    text?: unknown;
    occurredAt?: unknown;
    sourceChannels?: unknown;
    audioFileId?: unknown;
    photoFileIds?: unknown;
  };

  return {
    summary: typeof candidate.summary === 'string' ? candidate.summary : null,
    text: typeof candidate.text === 'string' ? candidate.text : null,
    occurredAt:
      typeof candidate.occurredAt === 'string' ? candidate.occurredAt : '',
    sourceChannels: Array.isArray(candidate.sourceChannels)
      ? candidate.sourceChannels.filter(
          (item): item is 'TEXT' | 'AUDIO' | 'PHOTO' =>
            item === 'TEXT' || item === 'AUDIO' || item === 'PHOTO',
        )
      : [],
    audioFileId:
      typeof candidate.audioFileId === 'string' ? candidate.audioFileId : null,
    photoFileIds: Array.isArray(candidate.photoFileIds)
      ? candidate.photoFileIds.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  };
}
