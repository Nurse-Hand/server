import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TaskPriorityAiGateway,
  TaskPrioritySuggestion,
} from '../../application/ports/task-priority-ai.gateway';
import {
  TaskAiResponseInvalidError,
  TaskAiTimeoutError,
  TaskAiUnavailableError,
} from '../../domain/task.errors';

const PRIORITIZE_PATH = '/internal/v1/tasks/prioritize';
const DEFAULT_TIMEOUT_MILLISECONDS = 15_000;
const MAX_RESPONSE_BODY_BYTES = 256 * 1024;

@Injectable()
export class HttpTaskPriorityAiAdapter implements TaskPriorityAiGateway {
  constructor(private readonly configService: ConfigService) {}

  async prioritize(input: {
    requestId: string;
    candidates: readonly {
      candidateKey: string;
      patientId: string | null;
      title: string;
      description: string | null;
      dueAt: Date | null;
      evidenceSourceIds: readonly string[];
    }[];
  }): Promise<readonly TaskPrioritySuggestion[]> {
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
            tasks: input.candidates.map((candidate) => ({
              taskId: candidate.candidateKey,
              patientId:
                candidate.patientId ?? `UNASSIGNED:${candidate.candidateKey}`,
              title: [candidate.title, candidate.description]
                .filter((value): value is string => Boolean(value))
                .join(' - '),
              dueAt: candidate.dueAt?.toISOString() ?? null,
              carriedOver: false,
            })),
            patientRisk: [],
            now: new Date().toISOString(),
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

      return parsePriorityResponse(body, input.candidates);
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

    const url = `${baseUrl.replace(/\/+$/, '')}${PRIORITIZE_PATH}`;
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

function parsePriorityResponse(
  body: unknown,
  candidates: readonly {
    candidateKey: string;
    evidenceSourceIds: readonly string[];
  }[],
): readonly TaskPrioritySuggestion[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('results' in body) ||
    !Array.isArray(body.results)
  ) {
    throw new TaskAiResponseInvalidError();
  }

  const evidenceByKey = new Map(
    candidates.map((candidate) => [candidate.candidateKey, candidate]),
  );

  return body.results.map((rawResult) => {
    const result = rawResult as {
      taskId?: unknown;
      priority?: unknown;
      confidence?: unknown;
      reasons?: unknown;
    };
    if (
      typeof result.taskId !== 'string' ||
      (result.priority !== 'CRITICAL' &&
        result.priority !== 'HIGH' &&
        result.priority !== 'NORMAL') ||
      (result.confidence !== 'HIGH' &&
        result.confidence !== 'MEDIUM' &&
        result.confidence !== 'LOW') ||
      !Array.isArray(result.reasons) ||
      result.reasons.some((value: unknown) => typeof value !== 'string')
    ) {
      throw new TaskAiResponseInvalidError();
    }

    const candidate = evidenceByKey.get(result.taskId);
    if (!candidate) {
      throw new TaskAiResponseInvalidError();
    }

    return {
      candidateKey: result.taskId,
      suggestedPriority: result.priority,
      confidence: result.confidence,
      reasons: result.reasons as readonly string[],
      evidenceSourceIds: [...candidate.evidenceSourceIds],
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
