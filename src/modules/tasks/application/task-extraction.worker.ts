import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Clock } from '../../../common/time/clock';
import { AiJobService } from '../../ai-jobs/application/ai-job.service';
import {
  TaskAiResponseInvalidError,
  TaskAiTimeoutError,
} from '../domain/task.errors';
import {
  TASK_AI_CONFIDENCES,
  TASK_EXTRACTION_LEASE_MILLISECONDS,
  TASK_EXTRACTION_OPERATION,
  TASK_PRIORITIES,
} from '../domain/task.types';
import { deriveSeoulWorkDate } from '../domain/task-work-date';
import {
  TASK_EXTRACTION_AI_GATEWAY,
  type ExtractedTaskCandidate,
  type TaskExtractionAiGateway,
} from './ports/task-extraction-ai.gateway';
import {
  TASK_PRIORITY_AI_GATEWAY,
  type TaskPriorityAiGateway,
  type TaskPrioritySuggestion,
} from './ports/task-priority-ai.gateway';
import {
  TASK_REPOSITORY,
  type CompleteTaskExtractionCandidate,
  type TaskExtractionWorkItem,
  type TaskRepository,
} from './ports/task.repository';

export type TaskExtractionWorkerResult =
  | { status: 'IDLE' }
  | { status: 'SUCCEEDED'; jobId: string }
  | { status: 'FAILED'; jobId: string; failureCode: string };

@Injectable()
export class TaskExtractionWorker {
  constructor(
    private readonly aiJobs: AiJobService,
    @Inject(TASK_REPOSITORY)
    private readonly repository: TaskRepository,
    @Inject(TASK_EXTRACTION_AI_GATEWAY)
    private readonly extractionGateway: TaskExtractionAiGateway,
    @Inject(TASK_PRIORITY_AI_GATEWAY)
    private readonly priorityGateway: TaskPriorityAiGateway,
    private readonly clock: Clock,
  ) {}

  async processNext(input: {
    datasetId: string;
    wardId: string;
  }): Promise<TaskExtractionWorkerResult> {
    const claim = await this.aiJobs.claimNext({
      datasetId: input.datasetId,
      wardId: input.wardId,
      operation: TASK_EXTRACTION_OPERATION,
      leaseMilliseconds: TASK_EXTRACTION_LEASE_MILLISECONDS,
    });

    if (claim === null) {
      return { status: 'IDLE' };
    }

    const workItem = await this.repository.findExtractionWorkItem(
      claim.datasetId,
      claim.jobId,
    );

    let candidates: readonly CompleteTaskExtractionCandidate[];

    try {
      const extracted = await this.extractionGateway.extract({
        requestId: claim.requestId,
        evidence: workItem.evidence,
      });
      const suggestions = await this.priorityGateway.prioritize({
        requestId: claim.requestId,
        candidates: extracted,
      });
      candidates = validateAndCombineAiResults(
        workItem,
        extracted,
        suggestions,
      );
    } catch (error: unknown) {
      const failure = classifyAiFailure(error);
      await this.aiJobs.fail({
        datasetId: claim.datasetId,
        jobId: claim.jobId,
        leaseVersion: claim.leaseVersion,
        failureCode: failure.code,
        retryable: failure.retryable,
      });

      return {
        status: 'FAILED',
        jobId: claim.jobId,
        failureCode: failure.code,
      };
    }

    await this.repository.completeExtraction({
      claim: {
        jobId: claim.jobId,
        datasetId: claim.datasetId,
        actorId: claim.actorId,
        wardId: claim.wardId,
        leaseVersion: claim.leaseVersion,
      },
      candidates,
      now: this.clock.now(),
    });

    return { status: 'SUCCEEDED', jobId: claim.jobId };
  }
}

function validateAndCombineAiResults(
  workItem: TaskExtractionWorkItem,
  extracted: readonly ExtractedTaskCandidate[],
  suggestions: readonly TaskPrioritySuggestion[],
): readonly CompleteTaskExtractionCandidate[] {
  if (!Array.isArray(extracted) || extracted.length > 50) {
    throw new TaskAiResponseInvalidError();
  }

  if (!Array.isArray(suggestions) || suggestions.length !== extracted.length) {
    throw new TaskAiResponseInvalidError();
  }

  const evidenceBySourceId = new Map(
    workItem.evidence.map((evidence) => [evidence.sourceId, evidence]),
  );
  const candidateByKey = new Map<string, ExtractedTaskCandidate>();

  for (const candidate of extracted) {
    assertCandidate(candidate, evidenceBySourceId);

    if (candidateByKey.has(candidate.candidateKey)) {
      throw new TaskAiResponseInvalidError();
    }

    candidateByKey.set(candidate.candidateKey, candidate);
  }

  const suggestionByKey = new Map<string, TaskPrioritySuggestion>();

  for (const suggestion of suggestions) {
    if (
      typeof suggestion !== 'object' ||
      suggestion === null ||
      typeof suggestion.candidateKey !== 'string'
    ) {
      throw new TaskAiResponseInvalidError();
    }

    const candidate = candidateByKey.get(suggestion.candidateKey);

    if (!candidate || suggestionByKey.has(suggestion.candidateKey)) {
      throw new TaskAiResponseInvalidError();
    }

    assertSuggestion(suggestion, candidate);
    suggestionByKey.set(suggestion.candidateKey, suggestion);
  }

  return [...candidateByKey.values()]
    .sort((left, right) => left.candidateKey.localeCompare(right.candidateKey))
    .map((candidate) => {
      const suggestion = suggestionByKey.get(candidate.candidateKey);

      if (!suggestion) {
        throw new TaskAiResponseInvalidError();
      }

      const referencedEvidence = candidate.evidenceSourceIds.map((sourceId) =>
        evidenceBySourceId.get(sourceId)!,
      );
      const workDate = candidate.dueAt
        ? deriveSeoulWorkDate(candidate.dueAt)
        : resolveEvidenceWorkDate(referencedEvidence);

      return {
        candidateKey: candidate.candidateKey,
        patientId: candidate.patientId,
        title: candidate.title,
        description: candidate.description,
        dueAt: candidate.dueAt,
        workDate,
        suggestedPriority: suggestion.suggestedPriority,
        reasons: [...suggestion.reasons],
        confidence: suggestion.confidence,
        evidenceSourceIds: [...suggestion.evidenceSourceIds],
      };
    });
}

function assertCandidate(
  candidate: ExtractedTaskCandidate,
  evidenceBySourceId: ReadonlyMap<
    string,
    TaskExtractionWorkItem['evidence'][number]
  >,
): void {
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !hasOnlyKeys(candidate, [
      'candidateKey',
      'patientId',
      'title',
      'description',
      'dueAt',
      'evidenceSourceIds',
    ]) ||
    typeof candidate.candidateKey !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(candidate.candidateKey) ||
    typeof candidate.title !== 'string' ||
    candidate.title.length === 0 ||
    candidate.title.length > 200 ||
    candidate.title.trim() !== candidate.title ||
    (candidate.description !== null &&
      (typeof candidate.description !== 'string' ||
        candidate.description.length > 1000)) ||
    (candidate.patientId !== null && !isUUID(candidate.patientId)) ||
    (candidate.dueAt !== null &&
      (!(candidate.dueAt instanceof Date) ||
        Number.isNaN(candidate.dueAt.getTime()))) ||
    !Array.isArray(candidate.evidenceSourceIds) ||
    candidate.evidenceSourceIds.length === 0 ||
    new Set(candidate.evidenceSourceIds).size !==
      candidate.evidenceSourceIds.length
  ) {
    throw new TaskAiResponseInvalidError();
  }

  const evidence = candidate.evidenceSourceIds.map((sourceId) =>
    evidenceBySourceId.get(sourceId),
  );

  if (evidence.some((item) => item === undefined)) {
    throw new TaskAiResponseInvalidError();
  }

  if (
    candidate.patientId !== null &&
    !evidence.some((item) => item?.patientId === candidate.patientId)
  ) {
    throw new TaskAiResponseInvalidError();
  }
}

function assertSuggestion(
  suggestion: TaskPrioritySuggestion,
  candidate: ExtractedTaskCandidate,
): void {
  const candidateEvidence = new Set(candidate.evidenceSourceIds);

  if (
    !hasOnlyKeys(suggestion, [
      'candidateKey',
      'suggestedPriority',
      'reasons',
      'confidence',
      'evidenceSourceIds',
    ]) ||
    !TASK_PRIORITIES.includes(suggestion.suggestedPriority) ||
    !TASK_AI_CONFIDENCES.includes(suggestion.confidence) ||
    !Array.isArray(suggestion.reasons) ||
    suggestion.reasons.length === 0 ||
    suggestion.reasons.some(
      (reason) =>
        typeof reason !== 'string' ||
        reason.length === 0 ||
        reason.length > 500,
    ) ||
    !Array.isArray(suggestion.evidenceSourceIds) ||
    suggestion.evidenceSourceIds.length === 0 ||
    new Set(suggestion.evidenceSourceIds).size !==
      suggestion.evidenceSourceIds.length ||
    suggestion.evidenceSourceIds.some(
      (sourceId) => !candidateEvidence.has(sourceId),
    )
  ) {
    throw new TaskAiResponseInvalidError();
  }
}

function hasOnlyKeys(value: object, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function resolveEvidenceWorkDate(
  evidence: readonly TaskExtractionWorkItem['evidence'][number][],
): Date {
  const timestamps = new Set(
    evidence.map(({ workDate }) => workDate.getTime()),
  );

  if (timestamps.size !== 1) {
    throw new TaskAiResponseInvalidError();
  }

  return new Date([...timestamps][0]);
}

function classifyAiFailure(error: unknown): {
  code: string;
  retryable: boolean;
} {
  if (error instanceof TaskAiTimeoutError) {
    return { code: 'TASK_AI_TIMEOUT', retryable: true };
  }

  if (error instanceof TaskAiResponseInvalidError) {
    return { code: 'TASK_AI_RESPONSE_INVALID', retryable: false };
  }

  return { code: 'TASK_AI_UNAVAILABLE', retryable: true };
}
