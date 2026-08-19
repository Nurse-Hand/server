import type { HandoffPrecheckDetail } from '../application/handoff-precheck.models';
import type {
  AnsweredHandoffPrecheckItemDataDto,
  HandoffPrecheckDataDto,
} from './handoff-precheck.dto';

export function toHandoffPrecheckData(
  detail: HandoffPrecheckDetail,
): HandoffPrecheckDataDto {
  return {
    precheckId: detail.precheckId,
    version: detail.version,
    jobId: detail.job.jobId,
    status: detail.job.status,
    failureCode: detail.job.failureCode,
    retryable: detail.job.retryable,
    modelVersion: detail.modelVersion,
    contractVersion: detail.contractVersion,
    generatedAt: detail.generatedAt?.toISOString() ?? null,
    summary: {
      critical: detail.items.filter(({ severity }) => severity === 'CRITICAL')
        .length,
      recommended: detail.items.filter(
        ({ severity }) => severity === 'RECOMMENDED',
      ).length,
    },
    items: detail.items.map((item) => ({
      ...item,
      evidence: item.evidence.map((evidence) => ({
        ...evidence,
        occurredAt: evidence.occurredAt?.toISOString() ?? null,
      })),
    })),
  };
}

export function toAnsweredPrecheckItemData(item: {
  itemId: string;
  answer: AnsweredHandoffPrecheckItemDataDto['answer'] | null;
  version: number;
}): AnsweredHandoffPrecheckItemDataDto {
  if (item.answer === null) throw new Error('HANDOFF_ANSWER_RESULT_MISSING');
  return { itemId: item.itemId, answer: item.answer, version: item.version };
}
