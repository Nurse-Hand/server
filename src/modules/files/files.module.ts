import { Module } from '@nestjs/common';
import { FilesService } from './application/files.service';
import { FILE_STORAGE } from './application/ports/file-storage.port';
import { STORED_FILE_REPOSITORY } from './application/ports/stored-file.repository';
import { LocalFileStorageAdapter } from './infrastructure/local-file-storage.adapter';
import { PrismaStoredFileRepository } from './infrastructure/prisma-stored-file.repository';
import { FilesController } from './presentation/files.controller';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    LocalFileStorageAdapter,
    PrismaStoredFileRepository,
    { provide: FILE_STORAGE, useExisting: LocalFileStorageAdapter },
    {
      provide: STORED_FILE_REPOSITORY,
      useExisting: PrismaStoredFileRepository,
    },
  ],
})
export class FilesModule {}
