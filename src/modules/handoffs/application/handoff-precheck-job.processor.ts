import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { AiJobService } from '../../ai-jobs/application/ai-job.service';
import type { AiJobClaim } from '../../ai-jobs/application/ports/ai-job.repository';
import {
  HANDOFF_JOB_LEASE_MILLISECONDS,
  HANDOFF_JOB_OPERATIONS,
} from '../domain/handoff.constants';
import {
  classifyHandoffAiFailure,
  HandoffAiGatewayError,
} from './ports/handoff-ai-failure';
import {
  HANDOFF_PRECHECK_AI_GATEWAY,
  type HandoffPrecheckAiGateway,
  type HandoffPrecheckAiInput,
} from './ports/handoff-precheck-ai.gateway';
import type {
  HandoffPrecheckAiEvidenceReference,
  HandoffPrecheckAiPatientInput,
  HandoffPrecheckAiResult,
} from './ports/handoff-precheck-ai.types';
import {
  HANDOFF_PRECHECK_REPOSITORY,
  type HandoffPrecheckRepository,
  type HandoffPrecheckWork,
  type PublishedHandoffPrecheckResult,
} from './ports/handoff-precheck.repository';

export type ProcessedHandoffPrecheckJob = {
  jobId: string;
  status: 'SUCCEEDED' | 'FAILED';
  failureCode?: string;
};

@Injectable()
export class HandoffPrecheckJobProcessor {
  constructor(
    private readonly aiJobService: AiJobService,
    @Inject(HANDOFF_PRECHECK_REPOSITORY)
    private readonly repository: HandoffPrecheckRepository,
    @Inject(HANDOFF_PRECHECK_AI_GATEWAY)
    private readonly gateway: HandoffPrecheckAiGateway,
    private readonly clock: Clock,
  ) {}

  async processNext(input: {
    datasetId: string;
    wardId: string;
  }): Promise<ProcessedHandoffPrecheckJob | null> {
    const claim = await this.aiJobService.claimNext({
      ...input,
      operation: HANDOFF_JOB_OPERATIONS.PRECHECK,
      leaseMilliseconds: HANDOFF_JOB_LEASE_MILLISECONDS,
    });
    if (claim === null) {
      return null;
    }

    try {
      const work = await this.repository.getWork(claim);
      const result = await this.gateway.analyze(
        toAiInput(work, claim.requestId),
      );
      await this.repository.publishResult({
        claim,
        result: toPublishedResult(work, result),
        now: this.clock.now(),
      });
      return { jobId: claim.jobId, status: 'SUCCEEDED' };
    } catch (error: unknown) {
      if (isClaimLost(error)) {
        throw error;
      }
      return this.failClaim(claim, error);
    }
  }

  private async failClaim(
    claim: AiJobClaim,
    error: unknown,
  ): Promise<ProcessedHandoffPrecheckJob> {
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
  work: HandoffPrecheckWork,
  requestId: string,
): HandoffPrecheckAiInput {
  return { requestId, patients: toAiPatients(work) };
}

function toAiPatients(
  work: HandoffPrecheckWork,
): readonly HandoffPrecheckAiPatientInput[] {
  return work.snapshot.patients.map((patient) => ({
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
  }));
}

function toPublishedResult(
  work: HandoffPrecheckWork,
  result: HandoffPrecheckAiResult,
): PublishedHandoffPrecheckResult {
  return {
    requestId: result.requestId,
    modelVersion: result.modelVersion,
    contractVersion: result.contractVersion,
    generatedAt: result.generatedAt,
    items: result.questions.map((question) => ({
      patientId: question.patientId,
      severity: question.severity,
      question: question.prompt,
      reason: question.reason,
      evidence: question.evidence.map((reference) =>
        resolveEvidence(work, reference),
      ),
    })),
  };
}

function resolveEvidence(
  work: HandoffPrecheckWork,
  reference: HandoffPrecheckAiEvidenceReference,
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

function isClaimLost(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'HANDOFF_JOB_CLAIM_LOST' ||
      error.code === 'AI_JOB_CLAIM_LOST')
  );
}
