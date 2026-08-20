import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FilesService } from '../../files/application/files.service';
import {
  RoundingAudioFileNotFoundError,
  RoundingPatientNotFoundError,
  RoundingRecordPeriodInvalidError,
  RoundingSessionAlreadyCompletedError,
  RoundingSessionNotFoundError,
} from '../domain/rounding.errors';
import {
  deriveRoundingWorkDate,
  formatRoundingWorkDate,
} from '../domain/rounding-work-date';
import type {
  CreateRoundingRecordInput,
  RoundingAudioChunkReadModel,
  RoundingRecordListView,
  RoundingRecordReadModel,
  UploadRoundingAudioChunkInput,
} from './rounding-record.types';

type PrismaTransaction = Prisma.TransactionClient;

type RoundingRecordRow = {
  id: string;
  actorId: string;
  wardId: string;
  roundingSessionId: string;
  patientId: string;
  sequence: number;
  workDate: Date;
  startedAt: Date;
  endedAt: Date;
  note: string | null;
  audioFileId: string | null;
  createdAt: Date;
  patient: {
    displayName: string;
    roomLabel: string;
  };
};

type RoundingAudioChunkRow = {
  id: string;
  roundingSessionId: string;
  createdAt: Date;
  audioFile: {
    id: string;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
    checksum: string;
  };
};

@Injectable()
export class RoundingRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly filesService: FilesService,
  ) {}

  async listToday(context: {
    datasetId: string;
    actorId: string;
    wardId: string;
  }): Promise<RoundingRecordListView> {
    const workDate = deriveRoundingWorkDate(this.clock.now());
    const rows = await this.prisma.roundingRecord.findMany({
      where: {
        datasetId: context.datasetId,
        actorId: context.actorId,
        wardId: context.wardId,
        workDate,
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: roundingRecordSelect,
    });

    return {
      date: workDate,
      items: rows.map(mapRoundingRecord),
    };
  }

  async create(
    input: CreateRoundingRecordInput,
  ): Promise<RoundingRecordReadModel> {
    if (input.startedAt.getTime() >= input.endedAt.getTime()) {
      throw new RoundingRecordPeriodInvalidError();
    }

    return this.prisma.$transaction(async (transaction) => {
      await assertSessionOpen(transaction, input.context, input.sessionId);
      await assertPatientAssigned(transaction, input);

      if (input.audioFileId) {
        const audioChunk = await transaction.roundingAudioChunk.findFirst({
          where: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            roundingSessionId: input.sessionId,
            audioFileId: input.audioFileId,
          },
          select: { id: true },
        });

        if (!audioChunk) {
          throw new RoundingAudioFileNotFoundError();
        }
      }

      const aggregate = await transaction.roundingRecord.aggregate({
        where: {
          datasetId: input.context.datasetId,
          roundingSessionId: input.sessionId,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      const created = await transaction.roundingRecord.create({
        data: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          roundingSessionId: input.sessionId,
          patientId: input.patientId,
          sequence: nextSequence,
          workDate: deriveRoundingWorkDate(input.startedAt),
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          note: input.note,
          audioFileId: input.audioFileId,
        },
        select: roundingRecordSelect,
      });

      return mapRoundingRecord(created);
    });
  }

  async uploadAudioChunk(
    input: UploadRoundingAudioChunkInput,
  ): Promise<RoundingAudioChunkReadModel> {
    await assertSessionOpen(this.prisma, input.context, input.sessionId);

    const storedFile = await this.filesService.upload(
      input.context,
      'AUDIO',
      input.file,
    );

    const chunk = await this.prisma.roundingAudioChunk.create({
      data: {
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
        roundingSessionId: input.sessionId,
        audioFileId: storedFile.id,
      },
      select: roundingAudioChunkSelect,
    });

    return mapRoundingAudioChunk(chunk);
  }
}

const roundingRecordSelect = {
  id: true,
  actorId: true,
  wardId: true,
  roundingSessionId: true,
  patientId: true,
  sequence: true,
  workDate: true,
  startedAt: true,
  endedAt: true,
  note: true,
  audioFileId: true,
  createdAt: true,
  patient: {
    select: {
      displayName: true,
      roomLabel: true,
    },
  },
};

const roundingAudioChunkSelect = {
  id: true,
  roundingSessionId: true,
  createdAt: true,
  audioFile: {
    select: {
      id: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
      checksum: true,
    },
  },
};

function mapRoundingRecord(row: RoundingRecordRow): RoundingRecordReadModel {
  return {
    id: row.id,
    sessionId: row.roundingSessionId,
    patientId: row.patientId,
    patientDisplayName: row.patient.displayName,
    patientRoomLabel: row.patient.roomLabel,
    actorId: row.actorId,
    wardId: row.wardId,
    sequence: row.sequence,
    workDate: row.workDate,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    note: row.note,
    audioFileId: row.audioFileId,
    createdAt: row.createdAt,
  };
}

function mapRoundingAudioChunk(
  row: RoundingAudioChunkRow,
): RoundingAudioChunkReadModel {
  return {
    id: row.id,
    sessionId: row.roundingSessionId,
    audioFileId: row.audioFile.id,
    mimeType: row.audioFile.mimeType,
    originalName: row.audioFile.originalName,
    sizeBytes: row.audioFile.sizeBytes,
    checksum: row.audioFile.checksum,
    createdAt: row.createdAt,
  };
}

async function assertSessionOpen(
  prisma: Pick<PrismaService, 'roundingSession'> | PrismaTransaction,
  context: { datasetId: string; actorId: string; wardId: string },
  sessionId: string,
): Promise<void> {
  const session = await prisma.roundingSession.findFirst({
    where: {
      id: sessionId,
      datasetId: context.datasetId,
      actorId: context.actorId,
      wardId: context.wardId,
    },
    select: { id: true, status: true },
  });

  if (!session) {
    throw new RoundingSessionNotFoundError();
  }

  if (session.status === 'COMPLETED') {
    throw new RoundingSessionAlreadyCompletedError();
  }
}

async function assertPatientAssigned(
  prisma: PrismaTransaction,
  input: CreateRoundingRecordInput,
): Promise<void> {
  const patient = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      datasetId: input.context.datasetId,
      wardId: input.context.wardId,
      patientAssignments: {
        some: {
          datasetId: input.context.datasetId,
          wardId: input.context.wardId,
          nurseId: input.context.actorId,
          startsAt: { lte: input.startedAt },
          OR: [{ endsAt: null }, { endsAt: { gte: input.endedAt } }],
        },
      },
    },
    select: { id: true },
  });

  if (!patient) {
    throw new RoundingPatientNotFoundError();
  }
}

export function toRoundingRecordDate(value: Date): string {
  return formatRoundingWorkDate(value);
}
