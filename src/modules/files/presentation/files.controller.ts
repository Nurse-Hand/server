import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiErrorResponseDto } from '../../../common/http/api-response.dto';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { DemoSessionContextParam } from '../../demo/presentation/demo-session-context.decorator';
import { FilesService } from '../application/files.service';
import type { UploadedFilePayload } from '../application/uploaded-file';
import { listAllowedStoredFileMimeTypes } from '../domain/file-upload-policy';
import {
  toStoredFileDataDto,
  type StoredFileDataDto,
  StoredFileResponseDto,
} from './stored-file.response.dto';
import { UploadFileRequestDto } from './upload-file-request.dto';

const AUDIO_UPLOAD_BODY_DESCRIPTION = `multipart/form-data field name은 file입니다. 허용 MIME types: ${listAllowedStoredFileMimeTypes('AUDIO').join(', ')}`;
const PHOTO_UPLOAD_BODY_DESCRIPTION = `multipart/form-data field name은 file입니다. 허용 MIME types: ${listAllowedStoredFileMimeTypes('PHOTO').join(', ')}`;

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('audio')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '오디오 파일 저장' })
  @ApiBody({
    description: AUDIO_UPLOAD_BODY_DESCRIPTION,
    type: UploadFileRequestDto,
  })
  @ApiCreatedResponse({ type: StoredFileResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async uploadAudio(
    @DemoSessionContextParam() context: DemoSessionContext,
    @UploadedFile() file: UploadedFilePayload | undefined,
  ): Promise<StoredFileDataDto> {
    const storedFile = await this.filesService.upload(context, 'AUDIO', file);

    return toStoredFileDataDto(storedFile);
  }

  @Post('photos')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '사진 파일 저장' })
  @ApiBody({
    description: PHOTO_UPLOAD_BODY_DESCRIPTION,
    type: UploadFileRequestDto,
  })
  @ApiCreatedResponse({ type: StoredFileResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ type: ApiErrorResponseDto })
  async uploadPhoto(
    @DemoSessionContextParam() context: DemoSessionContext,
    @UploadedFile() file: UploadedFilePayload | undefined,
  ): Promise<StoredFileDataDto> {
    const storedFile = await this.filesService.upload(context, 'PHOTO', file);

    return toStoredFileDataDto(storedFile);
  }
}
