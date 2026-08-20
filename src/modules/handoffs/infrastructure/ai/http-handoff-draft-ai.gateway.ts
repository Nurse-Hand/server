import { Injectable } from '@nestjs/common';
import type { HandoffDraftAiGateway } from '../../application/ports/handoff-draft-ai.gateway';
import type { HandoffDraftAiInput } from '../../application/ports/handoff-draft-ai.gateway';
import type { HandoffDraftAiResult } from '../../application/ports/handoff-draft-ai.types';
import {
  HANDOFF_CLINICAL_SECTIONS,
  type HandoffClinicalSection,
} from '../../domain/handoff.constants';
import { parseHandoffDraftAiResponse } from './handoff-draft-ai-response.parser';
import { HttpHandoffAiClient } from './http-handoff-ai.client';
import {
  createSourceReferenceResolver,
  handoffSectionOf,
  HTTP_HANDOFF_DRAFT_CONTRACT_VERSION,
  HTTP_HANDOFF_DRAFT_MODEL_VERSION,
  roundingSessionIdForRequest,
  toDraftPrecheckItems,
  toHttpEvidencePayloads,
  toHttpGenerateOpenTasks,
  type HandoffAiSourceReference,
} from './http-handoff-input.mapper';

const EMPTY_SECTION_CONTENT = '해당 항목에 반영할 근거가 없습니다.';

@Injectable()
export class HttpHandoffDraftAiGateway implements HandoffDraftAiGateway {
  constructor(private readonly client: HttpHandoffAiClient) {}

  async generate(input: HandoffDraftAiInput): Promise<HandoffDraftAiResult> {
    const patients = await Promise.all(
      input.patients.map(async (patient) => {
        const generated = await this.client.generate({
          requestId: input.requestId,
          patientId: patient.patientId,
          roundingSessionId: roundingSessionIdForRequest(input.requestId),
          evidences: toHttpEvidencePayloads(patient),
          openTasks: toHttpGenerateOpenTasks(patient),
        });
        const resolveSources = createSourceReferenceResolver(patient);
        const sectionsByTopic = new Map<
          HandoffClinicalSection,
          { content: string; citations: readonly HandoffAiSourceReference[] }
        >();

        for (const item of generated.items) {
          const previous = sectionsByTopic.get(item.topic);
          const content = compactContent(item.title, item.summary);
          const citations = resolveSources({
            evidenceIds: item.evidenceRefs.map(({ evidenceId }) => evidenceId),
          });
          sectionsByTopic.set(item.topic, {
            content: previous
              ? `${previous.content} ${content}`
              : content || EMPTY_SECTION_CONTENT,
            citations: uniqueReferences([
              ...(previous?.citations ?? []),
              ...citations,
            ]),
          });
        }

        return {
          patientId: patient.patientId,
          sections: HANDOFF_CLINICAL_SECTIONS.map((section) => {
            const generatedSection = sectionsByTopic.get(section);
            return {
              section,
              content:
                generatedSection?.content ??
                sectionFallbackContent(section, patient.timelineEvents.length),
              citations: generatedSection?.citations ?? [],
            };
          }),
        };
      }),
    );

    const normalized = {
      requestId: input.requestId,
      modelVersion: HTTP_HANDOFF_DRAFT_MODEL_VERSION,
      contractVersion: HTTP_HANDOFF_DRAFT_CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      patients,
      warnings: toDraftPrecheckItems(
        input.precheckItems,
        input.includeUnverified,
      )
        .filter(({ answer }) => answer === 'UNVERIFIED')
        .map((item) => ({
          code: 'UNVERIFIED_INFORMATION' as const,
          itemId: item.id,
          patientId: item.evidence[0]?.patientId,
          message: '확인되지 않은 정보이므로 수신자가 재확인해야 합니다.',
          evidence: item.evidence,
        })),
    };

    return parseHandoffDraftAiResponse(normalized, input);
  }
}

function compactContent(title: string, summary: string): string {
  const normalizedTitle = sanitizeText(title);
  const normalizedSummary = sanitizeText(summary);
  if (normalizedTitle === normalizedSummary) return normalizedSummary;
  return `${normalizedTitle}: ${normalizedSummary}`;
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sectionFallbackContent(
  section: HandoffClinicalSection,
  evidenceCount: number,
): string {
  if (evidenceCount === 0) return EMPTY_SECTION_CONTENT;
  return `${handoffSectionOf(section)}: 추가로 확인된 특이 근거가 없습니다.`;
}

function uniqueReferences(
  references: readonly HandoffAiSourceReference[],
): readonly HandoffAiSourceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.sourceType}:${reference.sourceId}:${reference.patientId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
