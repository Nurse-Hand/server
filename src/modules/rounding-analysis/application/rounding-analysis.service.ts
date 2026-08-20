import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  RoundingAnalysisConfirmationInvalidError,
  RoundingAnalysisJobNotFoundError,
  RoundingAnalysisSessionNotCompletedError,
} from '../domain/rounding-analysis.errors';
import type {
  RoundingAnalysisConfirmationResult,
  RoundingAnalysisJobReadModel,
  RoundingEvidenceReadModel,
  RoundingEvidenceTopic,
  RoundingSpeakerRole,
} from './rounding-analysis.models';

type StartAnalysisInput = {
  context: DemoSessionContext;
  sessionId: string;
  audioFileId?: string;
};

type ReadAnalysisInput = {
  context: DemoSessionContext;
  jobId: string;
};

type ConfirmAnalysisInput = {
  context: DemoSessionContext;
  sessionId: string;
  jobId: string;
  utterances: readonly {
    utteranceId: string;
    patientId?: string | null;
    speakerRole?: RoundingSpeakerRole;
    important?: boolean;
  }[];
};

type SearchEvidenceInput = {
  context: DemoSessionContext;
  patientId?: string;
  topic?: RoundingEvidenceTopic;
  query?: string;
  limit?: number;
};

@Injectable()
export class RoundingAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async start(
    input: StartAnalysisInput,
  ): Promise<RoundingAnalysisJobReadModel> {
    const existing = await this.prisma.roundingAnalysisJob.findFirst({
      where: {
        datasetId: input.context.datasetId,
        roundingSessionId: input.sessionId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
      },
      select: analysisJobSelect,
    });

    if (existing) {
      return mapAnalysisJob(existing);
    }

    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.roundingSession.findFirst({
        where: {
          id: input.sessionId,
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          segments: {
            orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              patientId: true,
              sequence: true,
              startedAt: true,
              endedAt: true,
              note: true,
              patient: {
                select: { displayName: true, roomLabel: true },
              },
            },
          },
        },
      });

      if (!session) {
        throw new RoundingAnalysisJobNotFoundError();
      }

      if (session.status !== 'COMPLETED') {
        throw new RoundingAnalysisSessionNotCompletedError();
      }

      if (input.audioFileId) {
        const audioFile = await transaction.storedFile.findFirst({
          where: {
            id: input.audioFileId,
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            kind: 'AUDIO',
          },
          select: { id: true },
        });

        if (!audioFile) {
          throw new RoundingAnalysisConfirmationInvalidError(
            '분석 대상 음성 파일을 찾을 수 없습니다.',
          );
        }
      }

      const generated = generateDeterministicAnalysis({
        audioFileId: input.audioFileId ?? null,
        segments: session.segments,
      });

      const job = await transaction.roundingAnalysisJob.create({
        data: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          roundingSessionId: session.id,
          audioFileId: input.audioFileId,
          status: 'SUCCEEDED',
          inputSnapshot: {
            roundingSessionId: session.id,
            audioFileId: input.audioFileId ?? null,
            segmentIds: session.segments.map((segment) => segment.id),
          },
          resultSnapshot: generated,
        },
        select: { id: true },
      });

      const transcript = await transaction.roundingTranscript.create({
        data: {
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          roundingSessionId: session.id,
          analysisJobId: job.id,
          fullText: generated.fullText,
        },
        select: { id: true },
      });

      await transaction.roundingUtterance.createMany({
        data: generated.utterances.map((utterance) => ({
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          transcriptId: transcript.id,
          analysisJobId: job.id,
          roundingSessionId: session.id,
          patientId: utterance.patientId,
          speakerLabel: utterance.speakerLabel,
          speakerRole: utterance.speakerRole,
          startedAtMs: utterance.startedAtMs,
          endedAtMs: utterance.endedAtMs,
          text: utterance.text,
          confidence: utterance.confidence,
          sourceAudioFileId: input.audioFileId,
        })),
      });

      await transaction.roundingSpeakerMatch.createMany({
        data: generated.speakerMatches.map((match) => ({
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          analysisJobId: job.id,
          roundingSessionId: session.id,
          speakerLabel: match.speakerLabel,
          rank: match.rank,
          candidatePatientId: match.candidatePatientId,
          displayName: match.displayName,
          similarity: match.similarity,
        })),
      });

      const created = await transaction.roundingAnalysisJob.findFirst({
        where: {
          id: job.id,
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
        },
        select: analysisJobSelect,
      });

      if (!created) {
        throw new RoundingAnalysisJobNotFoundError();
      }

      return mapAnalysisJob(created);
    });
  }

  async read(input: ReadAnalysisInput): Promise<RoundingAnalysisJobReadModel> {
    const job = await this.prisma.roundingAnalysisJob.findFirst({
      where: {
        id: input.jobId,
        datasetId: input.context.datasetId,
        actorId: input.context.actorId,
        wardId: input.context.wardId,
      },
      select: analysisJobSelect,
    });

    if (!job) {
      throw new RoundingAnalysisJobNotFoundError();
    }

    return mapAnalysisJob(job);
  }

  async confirm(
    input: ConfirmAnalysisInput,
  ): Promise<RoundingAnalysisConfirmationResult> {
    const now = this.clock.now();

    return this.prisma.$transaction(async (transaction) => {
      const job = await transaction.roundingAnalysisJob.findFirst({
        where: {
          id: input.jobId,
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
          roundingSessionId: input.sessionId,
          status: 'SUCCEEDED',
        },
        select: analysisJobSelect,
      });

      if (!job || !job.transcript) {
        throw new RoundingAnalysisJobNotFoundError();
      }

      const requested = new Map(
        input.utterances.map((utterance) => [utterance.utteranceId, utterance]),
      );
      const knownUtteranceIds = new Set(
        job.transcript.utterances.map((utterance) => utterance.id),
      );

      for (const utteranceId of requested.keys()) {
        if (!knownUtteranceIds.has(utteranceId)) {
          throw new RoundingAnalysisConfirmationInvalidError(
            '분석 결과에 없는 발화가 포함되어 있습니다.',
          );
        }
      }

      const patientIds = [
        ...new Set(
          input.utterances
            .map((utterance) => utterance.patientId)
            .filter((patientId): patientId is string => Boolean(patientId)),
        ),
      ];
      if (patientIds.length > 0) {
        const patients = await transaction.patient.findMany({
          where: {
            id: { in: patientIds },
            datasetId: input.context.datasetId,
            wardId: input.context.wardId,
          },
          select: { id: true },
        });
        if (patients.length !== patientIds.length) {
          throw new RoundingAnalysisConfirmationInvalidError(
            '확정할 수 없는 환자가 포함되어 있습니다.',
          );
        }
      }

      for (const utterance of job.transcript.utterances) {
        const confirmation = requested.get(utterance.id);
        if (!confirmation) {
          continue;
        }

        await transaction.roundingUtterance.update({
          where: {
            rounding_utterance_dataset_id: {
              datasetId: input.context.datasetId,
              id: utterance.id,
            },
          },
          data: {
            patientId:
              confirmation.patientId === undefined
                ? utterance.patientId
                : confirmation.patientId,
            speakerRole: confirmation.speakerRole ?? utterance.speakerRole,
            important: confirmation.important ?? utterance.important,
            confirmedAt: now,
          },
        });
      }

      await transaction.roundingTranscript.update({
        where: {
          rounding_transcript_analysis_scope: {
            datasetId: input.context.datasetId,
            analysisJobId: input.jobId,
          },
        },
        data: { confirmedAt: now },
      });

      const refreshed = await transaction.roundingAnalysisJob.findFirst({
        where: {
          id: input.jobId,
          datasetId: input.context.datasetId,
          actorId: input.context.actorId,
          wardId: input.context.wardId,
        },
        select: analysisJobSelect,
      });

      if (!refreshed || !refreshed.transcript) {
        throw new RoundingAnalysisJobNotFoundError();
      }

      const evidences: RoundingEvidenceReadModel[] = [];
      const timelineEventIds: string[] = [];
      const patientUtterances = refreshed.transcript.utterances.filter(
        (utterance) =>
          utterance.patientId &&
          (utterance.speakerRole === 'PATIENT_CANDIDATE' ||
            utterance.important),
      );

      for (const utterance of patientUtterances) {
        if (!utterance.patientId) {
          continue;
        }
        const topic = classifyTopic(utterance.text);
        const sourceReference = `rounding-analysis:${input.jobId}:utterance:${utterance.id}`;
        const logicalKey = `ra:${compactId(input.jobId)}:${compactId(utterance.id)}`;

        const existingTimeline = await transaction.timelineEvent.findFirst({
          where: {
            datasetId: input.context.datasetId,
            logicalKey,
          },
          select: { id: true },
        });

        const timelineEvent =
          existingTimeline ??
          (await transaction.timelineEvent.create({
            data: {
              datasetId: input.context.datasetId,
              logicalKey,
              patientId: utterance.patientId,
              wardId: input.context.wardId,
              occurredAt: new Date(
                refreshed.createdAt.getTime() + utterance.startedAtMs,
              ),
              type: 'OBSERVATION',
              source: 'AI_AUDIO',
              sourceReference,
              summary: summarizeEvidenceText(utterance.text),
            },
            select: { id: true },
          }));

        const existingEvidence = await transaction.roundingEvidence.findFirst({
          where: {
            datasetId: input.context.datasetId,
            analysisJobId: input.jobId,
            utteranceLinks: {
              some: {
                datasetId: input.context.datasetId,
                utteranceId: utterance.id,
              },
            },
          },
          select: evidenceSelect,
        });

        if (existingEvidence) {
          evidences.push(mapEvidence(existingEvidence));
          timelineEventIds.push(timelineEvent.id);
          continue;
        }

        const keywords = extractKeywords(utterance.text, topic);
        const createdEvidence = await transaction.roundingEvidence.create({
          data: {
            datasetId: input.context.datasetId,
            actorId: input.context.actorId,
            wardId: input.context.wardId,
            patientId: utterance.patientId,
            roundingSessionId: input.sessionId,
            analysisJobId: input.jobId,
            sourceType: 'ROUNDING_UTTERANCE',
            topic,
            handoffSection: handoffSectionOf(topic),
            keywords,
            structuredFacts: {
              summary: summarizeEvidenceText(utterance.text),
              speakerRole: utterance.speakerRole,
              startedAtMs: utterance.startedAtMs,
              endedAtMs: utterance.endedAtMs,
            },
            importanceFlags: utterance.important
              ? ['nurse_marked_important']
              : [],
            requiresNurseConfirmation: false,
            textForRetrieval: utterance.text,
            embedding: makeTextEmbedding(utterance.text),
            timelineEventId: timelineEvent.id,
          },
          select: { id: true },
        });

        await transaction.roundingEvidenceUtterance.create({
          data: {
            datasetId: input.context.datasetId,
            evidenceId: createdEvidence.id,
            utteranceId: utterance.id,
          },
        });

        const linkedEvidence = await transaction.roundingEvidence.findFirst({
          where: {
            datasetId: input.context.datasetId,
            id: createdEvidence.id,
          },
          select: evidenceSelect,
        });

        if (!linkedEvidence) {
          throw new RoundingAnalysisConfirmationInvalidError(
            '근거 저장 결과를 확인할 수 없습니다.',
          );
        }

        evidences.push(mapEvidence(linkedEvidence));
        timelineEventIds.push(timelineEvent.id);
      }

      return {
        job: mapAnalysisJob(refreshed),
        evidences,
        timelineEventIds,
      };
    });
  }

  async searchEvidence(
    input: SearchEvidenceInput,
  ): Promise<readonly RoundingEvidenceReadModel[]> {
    const rows = await this.prisma.roundingEvidence.findMany({
      where: {
        datasetId: input.context.datasetId,
        wardId: input.context.wardId,
        ...(input.patientId === undefined
          ? {}
          : { patientId: input.patientId }),
        ...(input.topic === undefined ? {} : { topic: input.topic }),
        ...(input.query === undefined || input.query.trim() === ''
          ? {}
          : {
              OR: [
                {
                  textForRetrieval: {
                    contains: input.query.trim(),
                    mode: 'insensitive',
                  },
                },
                { keywords: { has: input.query.trim() } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit ?? 20,
      select: evidenceSelect,
    });

    return rows.map(mapEvidence);
  }
}

const analysisJobSelect = {
  id: true,
  status: true,
  roundingSessionId: true,
  audioFileId: true,
  failureCode: true,
  createdAt: true,
  updatedAt: true,
  transcript: {
    select: {
      fullText: true,
      utterances: {
        orderBy: [{ startedAtMs: 'asc' as const }, { id: 'asc' as const }],
        select: {
          id: true,
          speakerLabel: true,
          speakerRole: true,
          patientId: true,
          startedAtMs: true,
          endedAtMs: true,
          text: true,
          confidence: true,
          important: true,
        },
      },
    },
  },
  speakerMatches: {
    orderBy: [
      { speakerLabel: 'asc' as const },
      { rank: 'asc' as const },
      { id: 'asc' as const },
    ],
    select: {
      speakerLabel: true,
      rank: true,
      candidatePatientId: true,
      displayName: true,
      similarity: true,
    },
  },
};

const evidenceSelect = {
  id: true,
  patientId: true,
  topic: true,
  handoffSection: true,
  keywords: true,
  importanceFlags: true,
  requiresNurseConfirmation: true,
  textForRetrieval: true,
  timelineEventId: true,
  createdAt: true,
  utteranceLinks: {
    select: {
      utteranceId: true,
    },
  },
};

type AnalysisJobRow = {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  roundingSessionId: string;
  audioFileId: string | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  transcript: null | {
    fullText: string;
    utterances: {
      id: string;
      speakerLabel: string;
      speakerRole: RoundingSpeakerRole;
      patientId: string | null;
      startedAtMs: number;
      endedAtMs: number;
      text: string;
      confidence: number | null;
      important: boolean;
    }[];
  };
  speakerMatches: {
    speakerLabel: string;
    rank: number;
    candidatePatientId: string | null;
    displayName: string;
    similarity: number;
  }[];
};

type EvidenceRow = {
  id: string;
  patientId: string;
  topic: RoundingEvidenceTopic;
  handoffSection: string;
  keywords: string[];
  importanceFlags: string[];
  requiresNurseConfirmation: boolean;
  textForRetrieval: string;
  timelineEventId: string | null;
  createdAt: Date;
  utteranceLinks: { utteranceId: string }[];
};

function mapAnalysisJob(row: AnalysisJobRow): RoundingAnalysisJobReadModel {
  return {
    jobId: row.id,
    status: row.status,
    roundingSessionId: row.roundingSessionId,
    audioFileId: row.audioFileId,
    fullText: row.transcript?.fullText ?? null,
    utterances:
      row.transcript?.utterances.map((utterance) => ({
        utteranceId: utterance.id,
        speakerLabel: utterance.speakerLabel,
        speakerRole: utterance.speakerRole,
        patientId: utterance.patientId,
        startedAtMs: utterance.startedAtMs,
        endedAtMs: utterance.endedAtMs,
        text: utterance.text,
        confidence: utterance.confidence,
        important: utterance.important,
      })) ?? [],
    speakerMatches: row.speakerMatches.map((match) => ({
      speakerLabel: match.speakerLabel,
      rank: match.rank,
      candidatePatientId: match.candidatePatientId,
      displayName: match.displayName,
      similarity: match.similarity,
    })),
    failureCode: row.failureCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvidence(row: EvidenceRow): RoundingEvidenceReadModel {
  return {
    evidenceId: row.id,
    patientId: row.patientId,
    topic: row.topic,
    handoffSection: row.handoffSection,
    keywords: row.keywords,
    importanceFlags: row.importanceFlags,
    requiresNurseConfirmation: row.requiresNurseConfirmation,
    textForRetrieval: row.textForRetrieval,
    sourceUtteranceIds: row.utteranceLinks.map((link) => link.utteranceId),
    timelineEventId: row.timelineEventId,
    createdAt: row.createdAt,
  };
}

function generateDeterministicAnalysis(input: {
  audioFileId: string | null;
  segments: readonly {
    id: string;
    patientId: string;
    sequence: number;
    note: string | null;
    patient: { displayName: string; roomLabel: string };
  }[];
}) {
  const utterances = input.segments.flatMap((segment, index) => {
    const baseMs = index * 30_000;
    const patientLabel = `SPEAKER_${String(index + 1).padStart(2, '0')}`;
    const patientText =
      segment.note?.trim() ||
      `${segment.patient.roomLabel} ${segment.patient.displayName} 환자 상태 확인이 필요합니다.`;

    return [
      {
        speakerLabel: 'SPEAKER_00',
        speakerRole: 'NURSE' as const,
        patientId: null,
        startedAtMs: baseMs,
        endedAtMs: baseMs + 4_000,
        text: `${segment.patient.roomLabel} ${segment.patient.displayName} 환자분 라운딩을 시작합니다.`,
        confidence: 0.96,
      },
      {
        speakerLabel: patientLabel,
        speakerRole: 'PATIENT_CANDIDATE' as const,
        patientId: segment.patientId,
        startedAtMs: baseMs + 5_000,
        endedAtMs: baseMs + 14_000,
        text: patientText,
        confidence: 0.91,
      },
    ];
  });

  return {
    engine: 'deterministic-rounding-analysis-v1',
    audioFileId: input.audioFileId,
    fullText: utterances.map((utterance) => utterance.text).join('\n'),
    utterances,
    speakerMatches: input.segments.map((segment, index) => ({
      speakerLabel: `SPEAKER_${String(index + 1).padStart(2, '0')}`,
      rank: 1,
      candidatePatientId: segment.patientId,
      displayName: `${segment.patient.roomLabel} ${segment.patient.displayName}`,
      similarity: 0.82,
    })),
  };
}

function classifyTopic(text: string): RoundingEvidenceTopic {
  if (/(혈압|맥박|체온|열|산소포화도|spo2|산소)/i.test(text)) {
    return 'VITAL_SIGNS';
  }
  if (/(기침|가래|호흡|숨|산소|네뷸라이저)/i.test(text)) {
    return 'RESPIRATION';
  }
  if (/(의식|혼돈|졸림|섬망|반응)/i.test(text)) {
    return 'MENTAL_STATUS';
  }
  if (/(통증|아파|nrs|쑤심|찌릿|욱신)/i.test(text)) {
    return 'PAIN';
  }
  if (/(처치|드레싱|dressing|suction|도뇨|배액|검사|시술|투여)/i.test(text)) {
    return 'TREATMENT';
  }
  if (/(식사|섭취|금식|npo|연하|구토|intake)/i.test(text)) {
    return 'DIET';
  }
  return 'OBSERVATION';
}

function handoffSectionOf(topic: RoundingEvidenceTopic): string {
  return {
    VITAL_SIGNS: '활력징후',
    RESPIRATION: '호흡',
    MENTAL_STATUS: '의식상태',
    PAIN: '통증',
    TREATMENT: '처치',
    DIET: '식이',
    OBSERVATION: '관찰사항·특이사항',
  }[topic];
}

function extractKeywords(text: string, topic: RoundingEvidenceTopic): string[] {
  const candidates = [
    '혈압',
    '맥박',
    '체온',
    '산소포화도',
    'SpO2',
    '기침',
    '호흡곤란',
    '통증',
    'NRS',
    '처치',
    '검사',
    '식사',
    '섭취',
    '보호자',
    '낙상',
  ];
  const found = candidates.filter((candidate) =>
    text.toLowerCase().includes(candidate.toLowerCase()),
  );
  return found.length > 0 ? found : [handoffSectionOf(topic)];
}

function summarizeEvidenceText(text: string): string {
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function makeTextEmbedding(text: string): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let index = 0; index < text.length; index += 1) {
    buckets[index % buckets.length] += text.charCodeAt(index);
  }
  const norm = Math.max(
    1,
    Math.sqrt(buckets.reduce((sum, value) => sum + value * value, 0)),
  );
  return buckets.map((value) => Number((value / norm).toFixed(6)));
}

function compactId(id: string): string {
  return id.replaceAll('-', '').slice(0, 16);
}
