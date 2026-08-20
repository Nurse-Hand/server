import { ApplicationError } from '../../../common/errors/application.error';

export class QuickNotePayloadEmptyError extends ApplicationError {
  constructor() {
    super({
      code: 'QUICK_NOTE_PAYLOAD_EMPTY',
      kind: 'UNPROCESSABLE_ENTITY',
      publicMessage:
        '빠른 기록은 텍스트, 음성 파일, 사진 중 하나 이상을 포함해야 합니다.',
    });
    this.name = QuickNotePayloadEmptyError.name;
  }
}

export class QuickNoteAttachmentNotFoundError extends ApplicationError {
  constructor(kind: 'AUDIO' | 'PHOTO') {
    super({
      code: 'QUICK_NOTE_ATTACHMENT_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: `연결할 ${kind === 'AUDIO' ? '음성' : '사진'} 파일을 찾을 수 없습니다.`,
      publicDetails: { kind },
    });
    this.name = QuickNoteAttachmentNotFoundError.name;
  }
}
