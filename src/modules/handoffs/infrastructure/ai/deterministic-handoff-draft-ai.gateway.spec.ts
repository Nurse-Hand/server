import type { HandoffDraftAiInput } from '../../application/ports/handoff-draft-ai.gateway';
import { DeterministicHandoffDraftAiGateway } from './deterministic-handoff-draft-ai.gateway';
import { parseHandoffDraftAiResponse } from './handoff-draft-ai-response.parser';

const REQUEST_ID = '00000000-0000-4000-8000-000000000101';
const PATIENT_ID = '00000000-0000-4000-8000-000000000201';
const EVENT_ID = '00000000-0000-4000-8000-000000000301';
const TASK_ID = '00000000-0000-4000-8000-000000000401';
const ITEM_ID = '00000000-0000-4000-8000-000000000501';
const FOREIGN_ID = '00000000-0000-4000-8000-000000000999';

describe('DeterministicHandoffDraftAiGateway', () => {
  it('NURSING_HANDOFF_V1 6개 section과 UNVERIFIED warning을 결정론적으로 생성한다', async () => {
    const gateway = new DeterministicHandoffDraftAiGateway();
    const first = await gateway.generate(input(true));
    const second = await gateway.generate(input(true));

    expect(first).toEqual(second);
    expect(first.patients[0].sections.map(({ section }) => section)).toEqual([
      'PATIENT_STATUS',
      'PAIN',
      'TREATMENT',
      'DIET',
      'ACTIVITY',
      'OBSERVATION',
    ]);
    expect(first.warnings).toEqual([
      expect.objectContaining({ itemId: ITEM_ID, patientId: PATIENT_ID }),
    ]);
  });

  it('includeUnverified=false이면 warning과 확인되지 않은 본문 승격이 없다', async () => {
    const result = await new DeterministicHandoffDraftAiGateway().generate(
      input(false),
    );
    expect(result.warnings).toEqual([]);
    expect(
      result.patients
        .flatMap(({ sections }) => sections)
        .every(({ content }) => !content.includes('확인되지 않은 정보 1건')),
    ).toBe(true);
  });

  it('입력 snapshot 밖 citation을 결과 전체 invalid로 거부한다', () => {
    const valid = rawResponse();
    const patients = valid.patients.map((patient) => ({
      ...patient,
      sections: patient.sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              citations: [
                {
                  sourceType: 'TIMELINE_EVENT',
                  sourceId: FOREIGN_ID,
                  patientId: PATIENT_ID,
                },
              ],
            }
          : section,
      ),
    }));

    expect(() =>
      parseHandoffDraftAiResponse({ ...valid, patients }, input(true)),
    ).toThrow('HANDOFF_AI_INVALID_RESPONSE');
  });
});

function input(includeUnverified: boolean): HandoffDraftAiInput {
  return {
    requestId: REQUEST_ID,
    templateId: 'NURSING_HANDOFF_V1',
    includeUnverified,
    patients: [
      {
        patientId: PATIENT_ID,
        timelineEvents: [
          {
            id: EVENT_ID,
            occurredAt: new Date('2026-08-18T01:00:00.000Z'),
            type: 'OBSERVATION',
            summary: '체온 상승 관찰',
            sourceReference: 'timeline:event:301',
          },
        ],
        tasks: [
          {
            id: TASK_ID,
            title: '체온 재측정',
            dueAt: null,
            effectivePriority: 'HIGH',
            version: 1,
            sourceReferences: ['task:401'],
          },
        ],
      },
    ],
    precheckItems: includeUnverified
      ? [
          {
            id: ITEM_ID,
            severity: 'RECOMMENDED',
            question: '확인해 주세요.',
            answer: 'UNVERIFIED',
            evidence: [
              {
                sourceType: 'TIMELINE_EVENT',
                sourceId: EVENT_ID,
                patientId: PATIENT_ID,
              },
            ],
          },
        ]
      : [],
  };
}

function rawResponse() {
  return {
    requestId: REQUEST_ID,
    modelVersion: 'model-v1',
    contractVersion: 'handoff-draft-v1',
    generatedAt: '2026-08-18T02:00:00.000Z',
    patients: [
      {
        patientId: PATIENT_ID,
        sections: [
          'PATIENT_STATUS',
          'PAIN',
          'TREATMENT',
          'DIET',
          'ACTIVITY',
          'OBSERVATION',
        ].map((section) => ({
          section,
          content: `${section} 내용`,
          citations: [
            {
              sourceType: 'TIMELINE_EVENT',
              sourceId: EVENT_ID,
              patientId: PATIENT_ID,
            },
          ],
        })),
      },
    ],
    warnings: [
      {
        code: 'UNVERIFIED_INFORMATION',
        itemId: ITEM_ID,
        patientId: PATIENT_ID,
        message: '재확인이 필요합니다.',
        evidence: [
          {
            sourceType: 'TIMELINE_EVENT',
            sourceId: EVENT_ID,
            patientId: PATIENT_ID,
          },
        ],
      },
    ],
  };
}
