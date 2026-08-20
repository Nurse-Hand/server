import { Injectable } from '@nestjs/common';
import type {
  HandoffPrecheckAiGateway,
  HandoffPrecheckAiInput,
} from '../../application/ports/handoff-precheck-ai.gateway';
import type { HandoffPrecheckAiResult } from '../../application/ports/handoff-precheck-ai.types';
import { parseHandoffPrecheckAiResponse } from './handoff-precheck-ai-response.parser';
import { HttpHandoffAiClient } from './http-handoff-ai.client';
import {
  createSourceReferenceResolver,
  fallbackSourceReferences,
  HTTP_HANDOFF_PRECHECK_CONTRACT_VERSION,
  HTTP_HANDOFF_PRECHECK_MODEL_VERSION,
  roundingSessionIdForRequest,
  toHttpEvidencePayloads,
  toHttpGenerateOpenTasks,
  toHttpPrecheckOpenTasks,
  type HandoffAiSourceReference,
} from './http-handoff-input.mapper';

@Injectable()
export class HttpHandoffPrecheckAiGateway implements HandoffPrecheckAiGateway {
  constructor(private readonly client: HttpHandoffAiClient) {}

  async analyze(
    input: HandoffPrecheckAiInput,
  ): Promise<HandoffPrecheckAiResult> {
    const questions = (
      await Promise.all(
        input.patients.map(async (patient) => {
          const candidateEvidence = toHttpEvidencePayloads(patient);
          const generated = await this.client.generate({
            requestId: input.requestId,
            patientId: patient.patientId,
            roundingSessionId: roundingSessionIdForRequest(input.requestId),
            evidences: candidateEvidence,
            openTasks: toHttpGenerateOpenTasks(patient),
          });
          const precheck = await this.client.precheck({
            requestId: input.requestId,
            draftId: generated.draftId,
            patientId: patient.patientId,
            draftItems: generated.items.map((item) => ({
              topic: item.topic,
              summary: item.summary,
            })),
            candidateEvidence,
            openTasks: toHttpPrecheckOpenTasks(patient),
          });
          const resolveSources = createSourceReferenceResolver(patient);
          const fallbackSources = fallbackSourceReferences(patient);

          return precheck.verificationItems.flatMap((item) => {
            const evidence = normalizedEvidence(
              resolveSources({
                evidenceIds: item.relatedEvidenceIds,
                taskIds: item.relatedTaskIds,
              }),
              fallbackSources,
            );
            if (evidence.length === 0) return [];
            return [
              {
                questionKey: item.id,
                patientId: item.patientId,
                severity: mapSeverity(item.severity),
                prompt: item.suggestedQuestion,
                reason: item.reason,
                evidence,
              },
            ];
          });
        }),
      )
    ).flat();

    const normalized = {
      requestId: input.requestId,
      modelVersion: HTTP_HANDOFF_PRECHECK_MODEL_VERSION,
      contractVersion: HTTP_HANDOFF_PRECHECK_CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      questions,
    };

    return parseHandoffPrecheckAiResponse(normalized, input);
  }
}

function normalizedEvidence(
  references: readonly HandoffAiSourceReference[],
  fallback: readonly HandoffAiSourceReference[],
): readonly HandoffAiSourceReference[] {
  const candidate = references.length > 0 ? references : fallback;
  const seen = new Set<string>();
  return candidate.filter((reference) => {
    const key = `${reference.sourceType}:${reference.sourceId}:${reference.patientId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapSeverity(
  severity: 'HIGH' | 'MEDIUM' | 'CRITICAL' | 'RECOMMENDED',
): 'CRITICAL' | 'RECOMMENDED' {
  if (severity === 'HIGH' || severity === 'CRITICAL') return 'CRITICAL';
  return 'RECOMMENDED';
}
