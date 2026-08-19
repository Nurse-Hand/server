import { ApiProperty } from '@nestjs/swagger';
import { ApiMetaDto } from '../../../common/http/api-response.dto';
import type { StoredFileRecord } from '../application/ports/stored-file.repository';
import { STORED_FILE_KINDS } from '../domain/file-kind';

export class StoredFileDataDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: STORED_FILE_KINDS })
  kind!: (typeof STORED_FILE_KINDS)[number];

  @ApiProperty({ example: 'audio/mp4' })
  mimeType!: string;

  @ApiProperty({ example: 123456 })
  sizeBytes!: number;

  @ApiProperty({
    example: 'f8ae677a835c417379ac9867a8d316afd95f0f3d36cb8d6f7cefeaa2e5ec9d27',
  })
  checksum!: string;

  @ApiProperty({ example: 'rounding-note.m4a' })
  originalName!: string;

  @ApiProperty({ example: '2026-08-19T00:00:00.000Z', format: 'date-time' })
  createdAt!: string;
}

export class StoredFileResponseDto {
  @ApiProperty({ type: StoredFileDataDto })
  data!: StoredFileDataDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export function toStoredFileDataDto(
  storedFile: StoredFileRecord,
): StoredFileDataDto {
  return {
    checksum: storedFile.checksum,
    createdAt: storedFile.createdAt.toISOString(),
    id: storedFile.id,
    kind: storedFile.kind,
    mimeType: storedFile.mimeType,
    originalName: storedFile.originalName,
    sizeBytes: storedFile.sizeBytes,
  };
}
