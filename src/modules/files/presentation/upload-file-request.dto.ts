import { ApiProperty } from '@nestjs/swagger';

export class UploadFileRequestDto {
  @ApiProperty({
    description: 'multipart/form-data file field',
    format: 'binary',
    type: 'string',
  })
  file!: string;
}
