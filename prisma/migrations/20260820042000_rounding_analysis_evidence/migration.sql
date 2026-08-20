CREATE TYPE "RoundingAnalysisJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TYPE "RoundingUtteranceSpeakerRole" AS ENUM ('NURSE', 'PATIENT_CANDIDATE', 'THIRD_PARTY', 'UNKNOWN');

CREATE TYPE "RoundingEvidenceSourceType" AS ENUM ('ROUNDING_UTTERANCE');

CREATE TYPE "RoundingEvidenceTopic" AS ENUM ('VITAL_SIGNS', 'RESPIRATION', 'MENTAL_STATUS', 'PAIN', 'TREATMENT', 'DIET', 'OBSERVATION');

CREATE TYPE "RoundingSpeakerProfileOwnerType" AS ENUM ('PATIENT', 'NURSE');

CREATE TABLE "RoundingAnalysisJob" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "audioFileId" UUID,
    "status" "RoundingAnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
    "failureCode" VARCHAR(100),
    "inputSnapshot" JSONB NOT NULL,
    "resultSnapshot" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoundingAnalysisJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundingTranscript" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "analysisJobId" UUID NOT NULL,
    "fullText" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoundingTranscript_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundingUtterance" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "transcriptId" UUID NOT NULL,
    "analysisJobId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "patientId" UUID,
    "speakerLabel" VARCHAR(64) NOT NULL,
    "speakerRole" "RoundingUtteranceSpeakerRole" NOT NULL DEFAULT 'UNKNOWN',
    "startedAtMs" INTEGER NOT NULL,
    "endedAtMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "sourceAudioFileId" UUID,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoundingUtterance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundingSpeakerMatch" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "analysisJobId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "speakerLabel" VARCHAR(64) NOT NULL,
    "rank" INTEGER NOT NULL,
    "candidatePatientId" UUID,
    "displayName" VARCHAR(100) NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundingSpeakerMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundingSpeakerProfile" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "ownerType" "RoundingSpeakerProfileOwnerType" NOT NULL,
    "patientId" UUID,
    "nurseId" UUID,
    "displayName" VARCHAR(100) NOT NULL,
    "embedding" JSONB NOT NULL,
    "sourceUtteranceIds" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RoundingSpeakerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundingEvidence" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "analysisJobId" UUID NOT NULL,
    "sourceType" "RoundingEvidenceSourceType" NOT NULL,
    "topic" "RoundingEvidenceTopic" NOT NULL,
    "handoffSection" VARCHAR(50) NOT NULL,
    "keywords" TEXT[],
    "structuredFacts" JSONB NOT NULL,
    "importanceFlags" TEXT[],
    "requiresNurseConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "textForRetrieval" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "timelineEventId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundingEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundingEvidenceUtterance" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "utteranceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundingEvidenceUtterance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rounding_analysis_job_dataset_id" ON "RoundingAnalysisJob"("datasetId", "id");
CREATE UNIQUE INDEX "rounding_analysis_job_session_once" ON "RoundingAnalysisJob"("datasetId", "roundingSessionId");
CREATE INDEX "RoundingAnalysisJob_datasetId_wardId_actorId_createdAt_id_idx" ON "RoundingAnalysisJob"("datasetId", "wardId", "actorId", "createdAt" DESC, "id");

CREATE UNIQUE INDEX "rounding_transcript_dataset_id" ON "RoundingTranscript"("datasetId", "id");
CREATE UNIQUE INDEX "RoundingTranscript_analysisJobId_key" ON "RoundingTranscript"("analysisJobId");
CREATE UNIQUE INDEX "rounding_transcript_analysis_scope" ON "RoundingTranscript"("datasetId", "analysisJobId");
CREATE INDEX "RoundingTranscript_datasetId_wardId_roundingSessionId_createdAt_id_idx" ON "RoundingTranscript"("datasetId", "wardId", "roundingSessionId", "createdAt" DESC, "id");

CREATE UNIQUE INDEX "rounding_utterance_dataset_id" ON "RoundingUtterance"("datasetId", "id");
CREATE INDEX "RoundingUtterance_datasetId_analysisJobId_startedAtMs_id_idx" ON "RoundingUtterance"("datasetId", "analysisJobId", "startedAtMs", "id");
CREATE INDEX "RoundingUtterance_datasetId_wardId_patientId_startedAtMs_id_idx" ON "RoundingUtterance"("datasetId", "wardId", "patientId", "startedAtMs", "id");

CREATE UNIQUE INDEX "rounding_speaker_match_dataset_id" ON "RoundingSpeakerMatch"("datasetId", "id");
CREATE UNIQUE INDEX "rounding_speaker_match_rank" ON "RoundingSpeakerMatch"("datasetId", "analysisJobId", "speakerLabel", "rank");
CREATE INDEX "RoundingSpeakerMatch_datasetId_analysisJobId_speakerLabel_rank_idx" ON "RoundingSpeakerMatch"("datasetId", "analysisJobId", "speakerLabel", "rank");

CREATE UNIQUE INDEX "rounding_speaker_profile_dataset_id" ON "RoundingSpeakerProfile"("datasetId", "id");
CREATE UNIQUE INDEX "rounding_speaker_profile_patient" ON "RoundingSpeakerProfile"("datasetId", "ownerType", "patientId");
CREATE UNIQUE INDEX "rounding_speaker_profile_nurse" ON "RoundingSpeakerProfile"("datasetId", "ownerType", "nurseId");

CREATE UNIQUE INDEX "rounding_evidence_dataset_id" ON "RoundingEvidence"("datasetId", "id");
CREATE INDEX "RoundingEvidence_datasetId_wardId_patientId_topic_createdAt_id_idx" ON "RoundingEvidence"("datasetId", "wardId", "patientId", "topic", "createdAt" DESC, "id");
CREATE INDEX "RoundingEvidence_datasetId_analysisJobId_createdAt_id_idx" ON "RoundingEvidence"("datasetId", "analysisJobId", "createdAt", "id");
CREATE INDEX "RoundingEvidence_datasetId_timelineEventId_idx" ON "RoundingEvidence"("datasetId", "timelineEventId");

CREATE UNIQUE INDEX "rounding_evidence_utterance_dataset_id" ON "RoundingEvidenceUtterance"("datasetId", "id");
CREATE UNIQUE INDEX "rounding_evidence_utterance_pair" ON "RoundingEvidenceUtterance"("datasetId", "evidenceId", "utteranceId");
CREATE INDEX "RoundingEvidenceUtterance_datasetId_utteranceId_idx" ON "RoundingEvidenceUtterance"("datasetId", "utteranceId");

ALTER TABLE "RoundingTranscript" ADD CONSTRAINT "RoundingTranscript_datasetId_analysisJobId_fkey" FOREIGN KEY ("datasetId", "analysisJobId") REFERENCES "RoundingAnalysisJob"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoundingUtterance" ADD CONSTRAINT "RoundingUtterance_datasetId_transcriptId_fkey" FOREIGN KEY ("datasetId", "transcriptId") REFERENCES "RoundingTranscript"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoundingSpeakerMatch" ADD CONSTRAINT "RoundingSpeakerMatch_datasetId_analysisJobId_fkey" FOREIGN KEY ("datasetId", "analysisJobId") REFERENCES "RoundingAnalysisJob"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoundingEvidenceUtterance" ADD CONSTRAINT "RoundingEvidenceUtterance_datasetId_evidenceId_fkey" FOREIGN KEY ("datasetId", "evidenceId") REFERENCES "RoundingEvidence"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoundingEvidenceUtterance" ADD CONSTRAINT "RoundingEvidenceUtterance_datasetId_utteranceId_fkey" FOREIGN KEY ("datasetId", "utteranceId") REFERENCES "RoundingUtterance"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
