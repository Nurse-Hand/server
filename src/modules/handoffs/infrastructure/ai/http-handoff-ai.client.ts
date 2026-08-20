import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { HandoffAiGatewayError } from '../../application/ports/handoff-ai-failure';
import type { HandoffClinicalSection } from '../../domain/handoff.constants';

const GENERATE_PATH = '/internal/v1/handoffs/generate';
const PRECHECK_PATH = '/internal/v1/handoffs/precheck';
const DEFAULT_TIMEOUT_MILLISECONDS = 15_000;
const MAX_RESPONSE_BODY_BYTES = 256 * 1024;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export type HttpHandoffEvidencePayload = {
  evidenceId: string;
  topic: HandoffClinicalSection;
  handoffSection: string;
  text: string;
  structuredFacts: Record<string, unknown>;
  importanceFlags: readonly string[];
  requiresNurseConfirmation: boolean;
};

export type HttpHandoffGenerateOpenTaskPayload = {
  taskId: string;
  patientId: string;
  title: string;
  dueAt: string | null;
  carriedOver: boolean;
};

export type HttpHandoffPrecheckOpenTaskPayload = {
  taskId: string;
  patientId: string | null;
  title: string;
  status: 'TODO';
  dueAt: string | null;
  effectivePriority: 'CRITICAL' | 'HIGH' | 'NORMAL';
};

export type HttpHandoffGenerateResult = {
  draftId: string;
  patientId: string;
  roundingSessionId: string;
  items: readonly {
    topic: HandoffClinicalSection;
    section: string;
    title: string;
    summary: string;
    requiresNurseConfirmation: boolean;
    confidence: number;
    evidenceRefs: readonly {
      evidenceId: string;
      displayQuote: string;
      isPrimary: boolean;
    }[];
  }[];
};

export type HttpHandoffPrecheckResult = {
  requestId: string;
  verificationItems: readonly {
    id: string;
    patientId: string;
    topic: HandoffClinicalSection;
    type:
      | 'MISSING_HANDOFF_ITEM'
      | 'OPEN_TASK_MISSING'
      | 'CONFLICT'
      | 'LOW_CONFIDENCE';
    severity: 'HIGH' | 'MEDIUM' | 'CRITICAL' | 'RECOMMENDED';
    title: string;
    reason: string;
    suggestedQuestion: string;
    suggestedDraftText: string;
    relatedEvidenceIds: readonly string[];
    relatedTaskIds: readonly string[];
    requiresNurseConfirmation: boolean;
  }[];
};

@Injectable()
export class HttpHandoffAiClient {
  constructor(private readonly configService: ConfigService) {}

  generate(input: {
    requestId: string;
    patientId: string;
    roundingSessionId: string;
    evidences: readonly HttpHandoffEvidencePayload[];
    openTasks: readonly HttpHandoffGenerateOpenTaskPayload[];
  }): Promise<HttpHandoffGenerateResult> {
    return this.postAndParse(
      GENERATE_PATH,
      {
        requestId: input.requestId,
        patientId: input.patientId,
        roundingSessionId: input.roundingSessionId,
        evidences: input.evidences,
        openTasks: input.openTasks,
      },
      (body) => parseGenerateResponse(body, input),
    );
  }

  precheck(input: {
    requestId: string;
    draftId: string;
    patientId: string;
    draftItems: readonly { topic: HandoffClinicalSection; summary: string }[];
    candidateEvidence: readonly HttpHandoffEvidencePayload[];
    openTasks: readonly HttpHandoffPrecheckOpenTaskPayload[];
  }): Promise<HttpHandoffPrecheckResult> {
    return this.postAndParse(
      PRECHECK_PATH,
      {
        requestId: input.requestId,
        draftId: input.draftId,
        patientId: input.patientId,
        draftItems: input.draftItems,
        candidateEvidence: input.candidateEvidence,
        openTasks: input.openTasks,
      },
      (body) => parsePrecheckResponse(body, input),
    );
  }

  private async postAndParse<T>(
    path: string,
    payload: unknown,
    parse: (body: unknown) => T,
  ): Promise<T> {
    const configuration = this.readConfiguration(path);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      configuration.timeoutMilliseconds,
    );

    try {
      let response: Response;
      try {
        response = await fetch(configuration.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Token': configuration.token,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new HandoffAiGatewayError('HANDOFF_AI_TIMEOUT', {
            cause: error,
          });
        }
        throw new HandoffAiGatewayError('HANDOFF_AI_UNAVAILABLE', {
          cause: error,
        });
      }

      if (response.status !== 201) {
        await cancelResponseBody(response);
        throw new HandoffAiGatewayError(
          response.status === 429
            ? 'HANDOFF_AI_RATE_LIMITED'
            : 'HANDOFF_AI_UNAVAILABLE',
        );
      }

      let body: unknown;
      try {
        body = JSON.parse(await readBoundedBody(response)) as unknown;
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new HandoffAiGatewayError('HANDOFF_AI_TIMEOUT', {
            cause: error,
          });
        }
        throw new HandoffAiGatewayError('HANDOFF_AI_INVALID_RESPONSE', {
          cause: error,
        });
      }

      return parse(body);
    } finally {
      clearTimeout(timeout);
    }
  }

  private readConfiguration(path: string): {
    url: string;
    token: string;
    timeoutMilliseconds: number;
  } {
    const baseUrl = this.configService.get<string>('AI_BASE_URL')?.trim();
    const token = this.configService
      .get<string>('AI_INTERNAL_API_TOKEN')
      ?.trim();
    const timeoutValue = this.configService.get<unknown>(
      'AI_PRIORITY_TIMEOUT_MS',
    );
    const timeoutMilliseconds =
      timeoutValue === undefined
        ? DEFAULT_TIMEOUT_MILLISECONDS
        : Number(timeoutValue);

    if (
      !baseUrl ||
      !token ||
      !Number.isInteger(timeoutMilliseconds) ||
      timeoutMilliseconds < 1
    ) {
      throw new HandoffAiGatewayError('HANDOFF_AI_UNAVAILABLE');
    }

    const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
    } catch {
      throw new HandoffAiGatewayError('HANDOFF_AI_UNAVAILABLE');
    }

    return { url, token, timeoutMilliseconds };
  }
}

function parseGenerateResponse(
  body: unknown,
  input: {
    patientId: string;
    roundingSessionId: string;
    evidences: readonly HttpHandoffEvidencePayload[];
  },
): HttpHandoffGenerateResult {
  const response = readObject(body);
  assertExactKeys(response, [
    'draftId',
    'patientId',
    'roundingSessionId',
    'items',
  ]);
  const patientId = readUuid(response.patientId);
  if (patientId !== input.patientId) invalidResponse();
  const roundingSessionId = readUuid(response.roundingSessionId);
  if (roundingSessionId !== input.roundingSessionId) invalidResponse();
  const evidenceIds = new Set(
    input.evidences.map(({ evidenceId }) => evidenceId),
  );

  return {
    draftId: readBoundedIdentifier(response.draftId),
    patientId,
    roundingSessionId,
    items: readArray(response.items).map((rawItem) => {
      const item = readObject(rawItem);
      assertExactKeys(item, [
        'topic',
        'section',
        'title',
        'summary',
        'requiresNurseConfirmation',
        'confidence',
        'evidenceRefs',
      ]);
      return {
        topic: readClinicalSection(item.topic),
        section: readBoundedString(item.section, 64),
        title: readBoundedString(item.title, 200),
        summary: readBoundedString(item.summary, 2000),
        requiresNurseConfirmation: readBoolean(item.requiresNurseConfirmation),
        confidence: readConfidence(item.confidence),
        evidenceRefs: readArray(item.evidenceRefs).map((rawReference) => {
          const reference = readObject(rawReference);
          assertExactKeys(reference, [
            'evidenceId',
            'displayQuote',
            'isPrimary',
          ]);
          const evidenceId = readUuid(reference.evidenceId);
          if (!evidenceIds.has(evidenceId)) invalidResponse();
          return {
            evidenceId,
            displayQuote: readBoundedString(reference.displayQuote, 1000),
            isPrimary: readBoolean(reference.isPrimary),
          };
        }),
      };
    }),
  };
}

function parsePrecheckResponse(
  body: unknown,
  input: {
    requestId: string;
    patientId: string;
    candidateEvidence: readonly HttpHandoffEvidencePayload[];
    openTasks: readonly HttpHandoffPrecheckOpenTaskPayload[];
  },
): HttpHandoffPrecheckResult {
  const response = readObject(body);
  assertExactKeys(response, ['requestId', 'verificationItems']);
  const requestId = readUuid(response.requestId);
  if (requestId !== input.requestId) invalidResponse();
  const evidenceIds = new Set(
    input.candidateEvidence.map(({ evidenceId }) => evidenceId),
  );
  const taskIds = new Set(input.openTasks.map(({ taskId }) => taskId));

  return {
    requestId,
    verificationItems: readArray(response.verificationItems).map((rawItem) => {
      const item = readObject(rawItem);
      assertExactKeys(item, [
        'id',
        'patientId',
        'topic',
        'type',
        'severity',
        'title',
        'reason',
        'suggestedQuestion',
        'suggestedDraftText',
        'relatedEvidenceIds',
        'relatedTaskIds',
        'requiresNurseConfirmation',
      ]);
      const patientId = readUuid(item.patientId);
      if (patientId !== input.patientId) invalidResponse();
      const relatedEvidenceIds = readArray(item.relatedEvidenceIds).map(
        (value) => {
          const evidenceId = readUuid(value);
          if (!evidenceIds.has(evidenceId)) invalidResponse();
          return evidenceId;
        },
      );
      const relatedTaskIds = readArray(item.relatedTaskIds).map((value) => {
        const taskId = readUuid(value);
        if (!taskIds.has(taskId)) invalidResponse();
        return taskId;
      });

      return {
        id: readBoundedIdentifier(item.id),
        patientId,
        topic: readClinicalSection(item.topic),
        type: readVerificationType(item.type),
        severity: readPrecheckSeverity(item.severity),
        title: readBoundedString(item.title, 200),
        reason: readBoundedString(item.reason, 2000),
        suggestedQuestion: readBoundedString(item.suggestedQuestion, 1000),
        suggestedDraftText: readBoundedString(item.suggestedDraftText, 2000),
        relatedEvidenceIds,
        relatedTaskIds,
        requiresNurseConfirmation: readBoolean(item.requiresNurseConfirmation),
      };
    }),
  };
}

async function readBoundedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const parsedContentLength = Number(contentLength);
    if (
      !Number.isInteger(parsedContentLength) ||
      parsedContentLength < 0 ||
      parsedContentLength > MAX_RESPONSE_BODY_BYTES
    ) {
      await cancelResponseBody(response);
      invalidResponse();
    }
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BODY_BYTES) {
        await reader.cancel();
        invalidResponse();
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Upstream body 정리 실패가 원래 오류를 가리지 않게 한다.
  }
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidResponse();
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) invalidResponse();
  return value as Record<string, unknown>;
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  if (value.length > 1000) invalidResponse();
  return value;
}

function readUuid(value: unknown): string {
  if (typeof value !== 'string' || !isUUID(value, '4')) invalidResponse();
  return value;
}

function readBoundedIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
    invalidResponse();
  }
  return value;
}

function readBoundedString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    [...value].some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code <= 31 || code === 127);
    })
  ) {
    invalidResponse();
  }
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalidResponse();
  return value;
}

function readConfidence(value: unknown): number {
  if (typeof value !== 'number' || value < 0 || value > 1) invalidResponse();
  return value;
}

function readClinicalSection(value: unknown): HandoffClinicalSection {
  if (
    value !== 'VITAL_SIGNS' &&
    value !== 'RESPIRATION' &&
    value !== 'MENTAL_STATUS' &&
    value !== 'PAIN' &&
    value !== 'TREATMENT' &&
    value !== 'DIET' &&
    value !== 'OBSERVATION'
  ) {
    invalidResponse();
  }
  return value;
}

function readVerificationType(
  value: unknown,
): HttpHandoffPrecheckResult['verificationItems'][number]['type'] {
  if (
    value !== 'MISSING_HANDOFF_ITEM' &&
    value !== 'OPEN_TASK_MISSING' &&
    value !== 'CONFLICT' &&
    value !== 'LOW_CONFIDENCE'
  ) {
    invalidResponse();
  }
  return value;
}

function readPrecheckSeverity(
  value: unknown,
): HttpHandoffPrecheckResult['verificationItems'][number]['severity'] {
  if (
    value !== 'HIGH' &&
    value !== 'MEDIUM' &&
    value !== 'CRITICAL' &&
    value !== 'RECOMMENDED'
  ) {
    invalidResponse();
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    invalidResponse();
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

function invalidResponse(): never {
  throw new HandoffAiGatewayError('HANDOFF_AI_INVALID_RESPONSE');
}
