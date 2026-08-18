export const APPLICATION_ERROR_KINDS = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
  'UPSTREAM_BAD_RESPONSE',
  'DEPENDENCY_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
] as const;

export type ApplicationErrorKind = (typeof APPLICATION_ERROR_KINDS)[number];

type ApplicationErrorOptions = {
  code: string;
  kind: ApplicationErrorKind;
  publicMessage: string;
  publicDetails?: Record<string, unknown>;
};

export class ApplicationError extends Error {
  readonly code: string;
  readonly kind: ApplicationErrorKind;
  readonly publicMessage: string;
  readonly publicDetails?: Record<string, unknown>;

  constructor(options: ApplicationErrorOptions) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(options.code)) {
      throw new TypeError(
        'Application error code는 UPPER_SNAKE_CASE여야 합니다.',
      );
    }

    super(options.code);
    this.name = ApplicationError.name;
    this.code = options.code;
    this.kind = options.kind;
    this.publicMessage = options.publicMessage;
    this.publicDetails = options.publicDetails;
  }
}
