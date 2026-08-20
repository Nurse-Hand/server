import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ExtractedTaskCandidate,
  TaskExtractionAiGateway,
} from '../../application/ports/task-extraction-ai.gateway';
import {
  TaskAiResponseInvalidError,
  TaskAiTimeoutError,
  TaskAiUnavailableError,
} from '../../domain/task.errors';

const EXTRACT_PATH = '/internal/v1/tasks/extract';
const DEFAULT_TIMEOUT_MILLISECONDS = 15_000;
const MAX_RESPONSE_BODY_BYTES = 256 * 1024;

@Injectable()
export class HttpTaskExtractionAiAdapter implements TaskExtractionAiGateway {
  constructor(private readonly configService: ConfigService) {}

  async extract(input: {
    requestId: string;
    evidence: readonly {
      sourceId: string;
      patientId: string | null;
      summary: string;
      workDate: Date;
    }[];
  }): Promise<readonly ExtractedTaskCandidate[]> {
    const configuration = this.readConfiguration();
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
          body: JSON.stringify({
            requestId: input.requestId,
            evidence: input.evidence.map((evidence) => ({
              sourceId: evidence.sourceId,
              patientId: evidence.patientId,
              summary: evidence.summary,
              workDate: evidence.workDate.toISOString().slice(0, 10),
            })),
          }),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new TaskAiTimeoutError();
        }
        throw new TaskAiUnavailableError();
      }

      if (response.status !== 201) {
        await cancelResponseBody(response);
        throw new TaskAiUnavailableError();
      }

      let body: unknown;
      try {
        body = JSON.parse(await readBoundedBody(response)) as unknown;
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new TaskAiTimeoutError();
        }
        throw new TaskAiResponseInvalidError();
      }

      return parseExtractionResponse(body);
    } finally {
      clearTimeout(timeout);
    }
  }

  private readConfiguration(): {
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
      throw new TaskAiUnavailableError();
    }

    const url = `${baseUrl.replace(/\/+$/, '')}${EXTRACT_PATH}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
    } catch {
      throw new TaskAiUnavailableError();
    }

    return { url, token, timeoutMilliseconds };
  }
}

function parseExtractionResponse(
  body: unknown,
): readonly ExtractedTaskCandidate[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('candidates' in body) ||
    !Array.isArray(body.candidates)
  ) {
    throw new TaskAiResponseInvalidError();
  }

  return body.candidates.map((rawCandidate, index) => {
    const candidate = rawCandidate as {
      candidateKey?: unknown;
      patientId?: unknown;
      title?: unknown;
      description?: unknown;
      dueAt?: unknown;
      evidenceSourceIds?: unknown;
    };
    if (
      typeof candidate.candidateKey !== 'string' ||
      candidate.candidateKey.length === 0 ||
      (candidate.patientId !== null &&
        (typeof candidate.patientId !== 'string' ||
          candidate.patientId.length === 0)) ||
      typeof candidate.title !== 'string' ||
      candidate.title.trim().length === 0 ||
      (candidate.description !== null &&
        candidate.description !== undefined &&
        typeof candidate.description !== 'string') ||
      (candidate.dueAt !== null &&
        candidate.dueAt !== undefined &&
        typeof candidate.dueAt !== 'string') ||
      !Array.isArray(candidate.evidenceSourceIds) ||
      candidate.evidenceSourceIds.length === 0 ||
      candidate.evidenceSourceIds.some(
        (value: unknown) => typeof value !== 'string',
      )
    ) {
      throw new TaskAiResponseInvalidError();
    }

    const dueAt =
      candidate.dueAt === null || candidate.dueAt === undefined
        ? null
        : new Date(candidate.dueAt);
    if (dueAt !== null && Number.isNaN(dueAt.getTime())) {
      throw new TaskAiResponseInvalidError();
    }

    return {
      candidateKey: candidate.candidateKey || `candidate-${index + 1}`,
      patientId: candidate.patientId ?? null,
      title: candidate.title.trim(),
      description: candidate.description?.trim() || null,
      dueAt,
      evidenceSourceIds: [
        ...new Set(candidate.evidenceSourceIds as readonly string[]),
      ],
    };
  });
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
      throw new TaskAiResponseInvalidError();
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
        throw new TaskAiResponseInvalidError();
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
    // no-op
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}
