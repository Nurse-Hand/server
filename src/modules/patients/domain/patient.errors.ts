import { ApplicationError } from '../../../common/errors/application.error';

export class PatientNotFoundError extends ApplicationError {
  constructor() {
    super({
      code: 'PATIENT_NOT_FOUND',
      kind: 'NOT_FOUND',
      publicMessage: '환자를 찾을 수 없습니다.',
    });
    this.name = PatientNotFoundError.name;
  }
}
