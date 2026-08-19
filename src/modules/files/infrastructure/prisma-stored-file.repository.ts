import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { StoredFileKind } from '../domain/file-kind';
import type {
  CreateStoredFileRecordInput,
  StoredFileRecord,
  StoredFileRepository,
} from '../application/ports/stored-file.repository';

@Injectable()
export class PrismaStoredFileRepository implements StoredFileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateStoredFileRecordInput): Promise<StoredFileRecord> {
    const storedFile = await this.prisma.storedFile.create({
      data: {
        actorId: input.actorId,
        checksum: input.checksum,
        datasetId: input.datasetId,
        kind: input.kind,
        mimeType: input.mimeType,
        originalName: input.originalName,
        sizeBytes: input.sizeBytes,
        storageUri: input.storageUri,
        wardId: input.wardId,
      },
      select: {
        actorId: true,
        checksum: true,
        createdAt: true,
        datasetId: true,
        id: true,
        kind: true,
        mimeType: true,
        originalName: true,
        sizeBytes: true,
        storageUri: true,
        wardId: true,
      },
    });

    return {
      actorId: storedFile.actorId,
      checksum: storedFile.checksum,
      createdAt: storedFile.createdAt,
      datasetId: storedFile.datasetId,
      id: storedFile.id,
      kind: storedFile.kind as StoredFileKind,
      mimeType: storedFile.mimeType,
      originalName: storedFile.originalName,
      sizeBytes: storedFile.sizeBytes,
      storageUri: storedFile.storageUri,
      wardId: storedFile.wardId,
    };
  }
}
