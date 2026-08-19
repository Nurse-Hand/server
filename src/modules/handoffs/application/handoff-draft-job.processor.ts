import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { AiJobService } from '../../ai-jobs/application/ai-job.service';
import type { AiJobClaim } from '../../ai-jobs/application/ports/ai-job.repository';
import {
  HANDOFF_JOB_LEASE_MILLISECONDS,
  HANDOFF_JOB_OPERATIONS,
} from '../domain/handoff.constants';
import type {
  HandoffDraftFrozenWork,
  HandoffDraftWarning,
} from './handoff-draft.models';
import {
  classifyHandoffAiFailure,
  HandoffAiGatewayError,
} from './ports/handoff-ai-failure';
import {
  HANDOFF_DRAFT_AI_GATEWAY,
  type HandoffDraftAiGateway,
  type HandoffDraftAiInput,
} from './ports/handoff-draft-ai.gateway';
import type {
  HandoffDraftAiEvidenceReference,
  HandoffDraftAiResult,
} from './ports/handoff-draft-ai.types';
import {
  HANDOFF_DRAFT_REPOSITORY,
  type HandoffDraftRepository,
  type PublishedHandoffDraftResult,
} from './ports/handoff-draft.repository';

export type ProcessedHandoffDraftJob = {
  jobId: string;
  status: 'SUCCEEDED' | 'FAILED';
  failureCode?: string;
};

@Injectable()
export class HandoffDraftJobProcessor {
  constructor(
    private readonly aiJobService: AiJobService,
    @Inject(HANDOFF_DRAFT_REPOSITORY)
    private readonly repository: HandoffDraftRepository,
    @Inject(HANDOFF_DRAFT_AI_GATEWAY)
    private readonly gateway: HandoffDraftAiGateway,
    private readonly clock: Clock,
  ) {}

  async processNext(input: {
    datasetId: string;
    wardId: string;
  }): Promise<ProcessedHandoffDraftJob | null> {
    const claim = await this.aiJobService.claimNext({
      ...input,
      operation: HANDOFF_JOB_OPERATIONS.GENERATE,
      leaseMilliseconds: HANDOFF_JOB_LEASE_MILLISECONDS,
    });
    if (claim === null) return null;

    const work = await this.repository.getWork(claim);
    let result: PublishedHandoffDraftResult;
    try {
      const aiResult = await this.gateway.generate(
        toAiInput(work, claim.requestId),
      );
      result = toPublishedResult(work, aiResult);
    } catch (error: unknown) {
      if (!isClassifiableAiFailure(error)) throw error;
      return this.failClaim(claim, error);
    }

    await this.repository.publishResult({
      claim,
      result,
      now: this.clock.now(),
    });
    return { jobId: claim.jobId, status: 'SUCCEEDED' };
  }

  private async failClaim(
    claim: AiJobClaim,
    error: unknown,
  ): Promise<ProcessedHandoffDraftJob> {
    const failure = classifyHandoffAiFailure(error);
    await this.aiJobService.fail({
      datasetId: claim.datasetId,
      jobId: claim.jobId,
      leaseVersion: claim.leaseVersion,
      failureCode: failure.code,
      retryable: failure.retryable,
    });
    return {
      jobId: claim.jobId,
      status: 'FAILED',
      failureCode: failure.code,
    };
  }
}

function toAiInput(
  work: HandoffDraftFrozenWork,
  requestId: string,
): HandoffDraftAiInput {
  return {
    requestId,
    templateId: work.templateId,
    includeUnverified: work.includeUnverified,
    patients: work.snapshot.patients.map((patient) => ({
      patientId: patient.patientId,
      timelineEvents: patient.timelineEvents.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        type: event.type,
        summary: event.summary,
        sourceReference: event.sourceReference,
      })),
      tasks: work.snapshot.tasks
        .filter((task) => task.patientId === patient.patientId)
        .map((task) => ({
          id: task.id,
          title: task.title,
          dueAt: task.dueAt,
          effectivePriority: task.effectivePriority,
          version: task.version,
          sourceReferences: task.sourceReferences,
        })),
    })),
    precheckItems: work.precheckItems
      .filter((item) => work.includeUnverified || item.answer !== 'UNVERIFIED')
      .map((item) => ({
        id: item.itemId,
        severity: item.severity,
        question: item.question,
        answer: item.answer,
        evidence: item.evidence.map((evidence) => ({
          sourceType: evidence.sourceType,
          sourceId: evidence.sourceId,
          patientId: item.patientId,
        })),
      })),
  };
}

function toPublishedResult(
  work: HandoffDraftFrozenWork,
  result: HandoffDraftAiResult,
): PublishedHandoffDraftResult {
  return {
    requestId: result.requestId,
    modelVersion: result.modelVersion,
    contractVersion: result.contractVersion,
    generatedAt: result.generatedAt,
    patients: result.patients.map((patient) => ({
      patientId: patient.patientId,
      sections: patient.sections.map((section) => ({
        section: section.section,
        aiOriginalContent: section.content,
        currentContent: section.content,
        isModified: false,
        citations: section.citations.map((reference) =>
          resolveEvidence(work, reference),
        ),
      })),
    })),
    warnings: result.warnings.map((warning) => {
      const item = work.precheckItems.find(
        ({ itemId }) => itemId === warning.itemId,
      );
      if (!item) throw new HandoffAiGatewayError('HANDOFF_AI_INVALID_RESPONSE');
      return toWarning(item);
    }),
  };
}

function resolveEvidence(
  work: HandoffDraftFrozenWork,
  reference: HandoffDraftAiEvidenceReference,
) {
  if (reference.sourceType === 'TIMELINE_EVENT') {
    const event = work.snapshot.patients
      .flatMap(({ timelineEvents }) => timelineEvents)
      .find(({ id }) => id === reference.sourceId);
    if (event) {
      return {
        sourceType: 'TIMELINE_EVENT' as const,
        sourceId: event.id,
        sourceReference: event.sourceReference,
        occurredAt: event.occurredAt,
        excerptKind: 'SUMMARY' as const,
        excerpt: event.summary,
      };
    }
  } else {
    const task = work.snapshot.tasks.find(
      ({ id }) => id === reference.sourceId,
    );
    if (task) {
      return {
        sourceType: 'TASK' as const,
        sourceId: task.id,
        sourceReference: task.sourceReferences[0] ?? `task:${task.id}`,
        occurredAt: null,
        excerptKind: 'TASK_TITLE' as const,
        excerpt: task.title,
      };
    }
  }
  throw new HandoffAiGatewayError('HANDOFF_AI_INVALID_RESPONSE');
}

function toWarning(
  item: HandoffDraftFrozenWork['precheckItems'][number],
): Omit<HandoffDraftWarning, 'isIncludedInAiInput'> {
  return {
    itemId: item.itemId,
    patientId: item.patientId,
    severity: item.severity,
    answer: item.answer,
    question: item.question,
  };
}

function isClassifiableAiFailure(error: unknown): boolean {
  return (
    error instanceof HandoffAiGatewayError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'HANDOFF_AI_RESULT_INVALID')
  );
}
