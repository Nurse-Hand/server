import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TaskPrioritySuggestionGateway,
  TaskPrioritySuggestionGatewayInput,
  TaskPrioritySuggestionGatewayResult,
} from '../../application/ports/task-priority-suggestion.gateway';
import {
  TaskAiResponseInvalidError,
  TaskAiTimeoutError,
  TaskAiUnavailableError,
} from '../../domain/task.errors';
import { parseTaskPrioritySuggestionResponse } from './task-priority-suggestion-response.parser';

const PRIORITIZE_PATH = '/internal/v1/tasks/prioritize';
const DEFAULT_TIMEOUT_MILLISECONDS = 15_000;

@Injectable()
export class HttpTaskPrioritySuggestionAdapter implements TaskPrioritySuggestionGateway {
  constructor(private readonly configService: ConfigService) {}

  async prioritize(
    input: TaskPrioritySuggestionGatewayInput,
  ): Promise<TaskPrioritySuggestionGatewayResult> {
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
            tasks: input.tasks,
            patientRisk: [],
            now: input.now,
          }),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new TaskAiTimeoutError();
        }
        throw new TaskAiUnavailableError();
      }

      if (response.status !== 201) throw new TaskAiUnavailableError();

      let body: unknown;
      try {
        body = JSON.parse(await response.text()) as unknown;
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw new TaskAiTimeoutError();
        }
        throw new TaskAiResponseInvalidError();
      }

      return parseTaskPrioritySuggestionResponse(body, {
        requestId: input.requestId,
        taskIds: input.tasks.map(({ taskId }) => taskId),
      });
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

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}
