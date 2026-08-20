import { ConfigService } from '@nestjs/config';
import { HttpHandoffAiClient } from './http-handoff-ai.client';
import { HttpHandoffDraftAiGateway } from './http-handoff-draft-ai.gateway';
import { HttpHandoffPrecheckAiGateway } from './http-handoff-precheck-ai.gateway';

const REQUEST_ID = '00000000-0000-4000-8000-000000000701';
const PATIENT_ID = '00000000-0000-4000-8000-000000000401';
const EVENT_ID = '00000000-0000-4000-8000-000000000501';
const RESPIRATION_EVENT_ID = '00000000-0000-4000-8000-000000000502';
const TREATMENT_EVENT_ID = '00000000-0000-4000-8000-000000000503';
const GENERIC_OXYGEN_EVENT_ID = '00000000-0000-4000-8000-000000000504';
const TASK_ID = '00000000-0000-4000-8000-000000000601';
const ITEM_ID = '00000000-0000-4000-8000-000000000801';
const NOW = new Date('2026-08-20T01:00:00.000Z');

describe('Http handoff AI gateways', () => {
  afterEach(() => jest.restoreAllMocks());

  it('draft gateway가 현재 AI generate 계약을 내부 7개 section 초안으로 변환한다', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        draftId: 'handoff-draft-001',
        patientId: PATIENT_ID,
        roundingSessionId: REQUEST_ID,
        items: [
          {
            topic: 'VITAL_SIGNS',
            section: '활력징후',
            title: '301호 활력징후',
            summary: '산소포화도 94%로 재측정 필요',
            requiresNurseConfirmation: false,
            confidence: 0.92,
            evidenceRefs: [
              {
                evidenceId: EVENT_ID,
                displayQuote: '산소포화도 94%로 재측정 필요',
                isPrimary: true,
              },
            ],
          },
        ],
      }),
    );

    const result = await draftGateway().generate(draftInput(true));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example.test/internal/v1/handoffs/generate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': 'synthetic-token',
        },
        body: JSON.stringify({
          requestId: REQUEST_ID,
          patientId: PATIENT_ID,
          roundingSessionId: REQUEST_ID,
          evidences: [
            {
              evidenceId: EVENT_ID,
              topic: 'VITAL_SIGNS',
              handoffSection: '활력징후',
              text: '산소포화도 94%로 재측정 필요',
              structuredFacts: {
                sourceReference: 'rounding-analysis:job:utterance:1',
                eventType: 'OBSERVATION',
                occurredAt: NOW.toISOString(),
              },
              importanceFlags: [],
              requiresNurseConfirmation: false,
            },
          ],
          openTasks: [
            {
              taskId: TASK_ID,
              patientId: PATIENT_ID,
              title: '산소포화도 재측정',
              dueAt: null,
              carriedOver: false,
            },
          ],
        }),
      }),
    );
    expect(result.modelVersion).toBe('http-handoff-generate-v1');
    expect(result.patients[0].sections).toHaveLength(7);
    expect(result.patients[0].sections[0]).toEqual({
      section: 'VITAL_SIGNS',
      content: '301호 활력징후: 산소포화도 94%로 재측정 필요',
      citations: [
        {
          sourceType: 'TIMELINE_EVENT',
          sourceId: EVENT_ID,
          patientId: PATIENT_ID,
        },
      ],
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        itemId: ITEM_ID,
        patientId: PATIENT_ID,
      }),
    ]);
  });

  it('근거 topic을 임상 의미로 분류하고 AI가 누락한 section을 원본 citation으로 결정론적으로 복구한다', async () => {
    const incompleteGenerateResponse = {
      draftId: 'handoff-draft-001',
      patientId: PATIENT_ID,
      roundingSessionId: REQUEST_ID,
      items: [
        {
          topic: 'VITAL_SIGNS',
          section: '활력징후',
          title: '잘못 분류된 호흡 근거',
          summary: '기침과 가래가 있어 호흡 상태 확인 필요',
          requiresNurseConfirmation: false,
          confidence: 0.7,
          evidenceRefs: [
            {
              evidenceId: RESPIRATION_EVENT_ID,
              displayQuote: '기침과 가래가 있고 호흡곤란 및 숨참 호소',
              isPrimary: true,
            },
          ],
        },
      ],
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(incompleteGenerateResponse))
      .mockResolvedValueOnce(jsonResponse(incompleteGenerateResponse));
    const input = draftInput(
      false,
      patientInput(
        [
          timelineEvent(EVENT_ID, 'SpO2 94%, 혈압과 체온 재측정 필요'),
          timelineEvent(
            RESPIRATION_EVENT_ID,
            '기침과 가래가 있고 호흡곤란 및 숨참 호소',
          ),
          timelineEvent(
            TREATMENT_EVENT_ID,
            '산소 투여 중이며 비강 캐뉼라 2L 유지',
          ),
          timelineEvent(
            GENERIC_OXYGEN_EVENT_ID,
            '산소 관련 상태 추가 확인 필요',
          ),
        ],
        [],
      ),
    );
    const gateway = draftGateway();

    const first = await gateway.generate(input);
    const second = await gateway.generate(input);

    const requestBody = JSON.parse(
      fetchMock.mock.calls[0]![1]!.body as string,
    ) as {
      evidences: Array<{
        evidenceId: string;
        topic: string;
        handoffSection: string;
      }>;
    };
    expect(
      requestBody.evidences.map(({ evidenceId, topic, handoffSection }) => ({
        evidenceId,
        topic,
        handoffSection,
      })),
    ).toEqual([
      {
        evidenceId: EVENT_ID,
        topic: 'VITAL_SIGNS',
        handoffSection: '활력징후',
      },
      {
        evidenceId: RESPIRATION_EVENT_ID,
        topic: 'RESPIRATION',
        handoffSection: '호흡',
      },
      {
        evidenceId: TREATMENT_EVENT_ID,
        topic: 'TREATMENT',
        handoffSection: '처치',
      },
      {
        evidenceId: GENERIC_OXYGEN_EVENT_ID,
        topic: 'OBSERVATION',
        handoffSection: '관찰사항·특이사항',
      },
    ]);
    expect(first.patients).toEqual(second.patients);
    expect(first.patients[0].sections.map(({ section }) => section)).toEqual([
      'VITAL_SIGNS',
      'RESPIRATION',
      'MENTAL_STATUS',
      'PAIN',
      'TREATMENT',
      'DIET',
      'OBSERVATION',
    ]);
    expect(first.patients[0].sections).toEqual(
      expect.arrayContaining([
        {
          section: 'VITAL_SIGNS',
          content: '활력징후: SpO2 94%, 혈압과 체온 재측정 필요',
          citations: [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: EVENT_ID,
              patientId: PATIENT_ID,
            },
          ],
        },
        {
          section: 'RESPIRATION',
          content: '호흡: 기침과 가래가 있고 호흡곤란 및 숨참 호소',
          citations: [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: RESPIRATION_EVENT_ID,
              patientId: PATIENT_ID,
            },
          ],
        },
        {
          section: 'TREATMENT',
          content: '처치: 산소 투여 중이며 비강 캐뉼라 2L 유지',
          citations: [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: TREATMENT_EVENT_ID,
              patientId: PATIENT_ID,
            },
          ],
        },
        {
          section: 'OBSERVATION',
          content: '관찰사항·특이사항: 산소 관련 상태 추가 확인 필요',
          citations: [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: GENERIC_OXYGEN_EVENT_ID,
              patientId: PATIENT_ID,
            },
          ],
        },
      ]),
    );
  });

  it('precheck gateway가 generate 후 precheck를 호출하고 HIGH severity를 CRITICAL로 매핑한다', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          draftId: 'handoff-draft-001',
          patientId: PATIENT_ID,
          roundingSessionId: REQUEST_ID,
          items: [
            {
              topic: 'VITAL_SIGNS',
              section: '활력징후',
              title: '301호 활력징후',
              summary: '산소포화도 94%로 재측정 필요',
              requiresNurseConfirmation: false,
              confidence: 0.92,
              evidenceRefs: [
                {
                  evidenceId: EVENT_ID,
                  displayQuote: '산소포화도 94%로 재측정 필요',
                  isPrimary: true,
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          requestId: REQUEST_ID,
          verificationItems: [
            {
              id: 'handoff-precheck-item-001',
              patientId: PATIENT_ID,
              topic: 'VITAL_SIGNS',
              type: 'MISSING_HANDOFF_ITEM',
              severity: 'HIGH',
              title: '산소포화도 재확인',
              reason:
                '산소포화도 94% 기록이 있으나 인수인계 문장 확인이 필요합니다.',
              suggestedQuestion: '산소포화도 재측정 결과를 확인했나요?',
              suggestedDraftText: '산소포화도 94%로 재측정 필요',
              relatedEvidenceIds: [EVENT_ID],
              relatedTaskIds: [],
              requiresNurseConfirmation: true,
            },
          ],
        }),
      );

    const result = await precheckGateway().analyze(precheckInput());

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://ai.example.test/internal/v1/handoffs/precheck',
      expect.objectContaining({ method: 'POST' }),
    );
    const precheckBody = JSON.parse(
      fetchMock.mock.calls[1]![1]!.body as string,
    ) as unknown;
    expect(precheckBody).toEqual({
      requestId: REQUEST_ID,
      draftId: 'handoff-draft-001',
      patientId: PATIENT_ID,
      draftItems: [
        {
          topic: 'VITAL_SIGNS',
          summary: '산소포화도 94%로 재측정 필요',
        },
      ],
      candidateEvidence: [
        expect.objectContaining({
          evidenceId: EVENT_ID,
          text: '산소포화도 94%로 재측정 필요',
        }),
      ],
      openTasks: [
        {
          taskId: TASK_ID,
          patientId: PATIENT_ID,
          title: '산소포화도 재측정',
          status: 'TODO',
          dueAt: null,
          effectivePriority: 'HIGH',
        },
      ],
    });
    expect(result.modelVersion).toBe('http-handoff-precheck-v1');
    expect(result.questions).toEqual([
      {
        questionKey: 'handoff-precheck-item-001',
        patientId: PATIENT_ID,
        severity: 'CRITICAL',
        prompt: '산소포화도 재측정 결과를 확인했나요?',
        reason: '산소포화도 94% 기록이 있으나 인수인계 문장 확인이 필요합니다.',
        evidence: [
          {
            sourceType: 'TIMELINE_EVENT',
            sourceId: EVENT_ID,
            patientId: PATIENT_ID,
          },
        ],
      },
    ]);
  });
});

function draftGateway(): HttpHandoffDraftAiGateway {
  return new HttpHandoffDraftAiGateway(client());
}

function precheckGateway(): HttpHandoffPrecheckAiGateway {
  return new HttpHandoffPrecheckAiGateway(client());
}

function client(): HttpHandoffAiClient {
  return new HttpHandoffAiClient(
    new ConfigService({
      AI_BASE_URL: 'https://ai.example.test',
      AI_INTERNAL_API_TOKEN: 'synthetic-token',
      AI_PRIORITY_TIMEOUT_MS: 15_000,
    }),
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function draftInput(includeUnverified: boolean, patient = patientInput()) {
  return {
    requestId: REQUEST_ID,
    templateId: 'NURSING_HANDOFF_V1' as const,
    includeUnverified,
    patients: [patient],
    precheckItems: includeUnverified
      ? [
          {
            id: ITEM_ID,
            severity: 'RECOMMENDED' as const,
            question: '산소포화도 재확인 여부를 확인해 주세요.',
            answer: 'UNVERIFIED' as const,
            evidence: [
              {
                sourceType: 'TIMELINE_EVENT' as const,
                sourceId: EVENT_ID,
                patientId: PATIENT_ID,
              },
            ],
          },
        ]
      : [],
  };
}

function precheckInput() {
  return {
    requestId: REQUEST_ID,
    patients: [patientInput()],
  };
}

function patientInput(
  timelineEvents = [
    timelineEvent(
      EVENT_ID,
      '산소포화도 94%로 재측정 필요',
      'rounding-analysis:job:utterance:1',
    ),
  ],
  tasks = [
    {
      id: TASK_ID,
      title: '산소포화도 재측정',
      dueAt: null,
      effectivePriority: 'HIGH' as const,
      version: 1,
      sourceReferences: ['task:601'],
    },
  ],
) {
  return {
    patientId: PATIENT_ID,
    timelineEvents,
    tasks,
  };
}

function timelineEvent(
  id: string,
  summary: string,
  sourceReference = `rounding-analysis:${id}`,
) {
  return {
    id,
    occurredAt: NOW,
    type: 'OBSERVATION' as const,
    summary,
    sourceReference,
  };
}
