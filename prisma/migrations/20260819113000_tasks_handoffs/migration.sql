CREATE TYPE "HandoffStatus" AS ENUM ('GENERATING', 'DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "HandoffItemSeverity" AS ENUM ('CRITICAL', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "HandoffAnswerCode" AS ENUM ('NO_ISSUE', 'INCLUDE_HANDOFF', 'UNVERIFIED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "HandoffEvidenceSourceType" AS ENUM ('TIMELINE_EVENT', 'TASK');

-- CreateEnum
CREATE TYPE "HandoffTaskPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL');

-- CreateEnum
CREATE TYPE "HandoffClinicalSection" AS ENUM ('PATIENT_STATUS', 'PAIN', 'TREATMENT', 'DIET', 'ACTIVITY', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "HandoffWarningType" AS ENUM ('UNVERIFIED', 'UNANSWERED_RECOMMENDED');

-- CreateEnum
CREATE TYPE "HandoffFinalizeResolution" AS ENUM ('RESOLVED', 'KEEP_WITH_WARNING');

-- CreateEnum
CREATE TYPE "HandoffAcknowledgementStatus" AS ENUM ('QUESTIONED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "HandoffAuditEventType" AS ENUM ('HANDOFF_CREATED', 'GENERATION_RETRIED', 'DRAFT_GENERATED', 'DRAFT_UPDATED', 'FINALIZED', 'FIRST_VIEWED', 'QUESTIONED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'AI_EXTRACTED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL');

-- CreateEnum
CREATE TYPE "TaskAiConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TaskEvidenceSourceType" AS ENUM ('TIMELINE_EVENT', 'TASK');

-- CreateEnum
CREATE TYPE "TaskPriorityAuditAction" AS ENUM ('ACCEPT_AI', 'MANUAL_SET', 'CLEARED');
CREATE TABLE "HandoffPrecheck" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "senderActorId" UUID NOT NULL,
    "receiverActorId" UUID NOT NULL,
    "senderShiftId" UUID NOT NULL,
    "receiverShiftId" UUID NOT NULL,
    "handoffDate" DATE NOT NULL,
    "targetDuty" "ShiftDuty" NOT NULL,
    "aiJobId" UUID NOT NULL,
    "idempotencyRecordId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "requestId" UUID NOT NULL,
    "aiModelVersion" VARCHAR(100),
    "aiContractVersion" VARCHAR(100),
    "aiGeneratedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "lockedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoffPrecheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPrecheckPatientInput" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "precheckId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffPrecheckPatientInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPrecheckTimelineInput" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "precheckId" UUID NOT NULL,
    "timelineEventId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "eventType" "TimelineEventType" NOT NULL,
    "eventSource" "TimelineEventSource" NOT NULL,
    "sourceReference" VARCHAR(128) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffPrecheckTimelineInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPrecheckTaskInput" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "precheckId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "patientId" UUID,
    "title" VARCHAR(500) NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "effectivePriority" "HandoffTaskPriority" NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "capturedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffPrecheckTaskInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPrecheckTaskSourceReference" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "precheckId" UUID NOT NULL,
    "taskInputId" UUID NOT NULL,
    "reference" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffPrecheckTaskSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPrecheckItem" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "precheckId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "severity" "HandoffItemSeverity" NOT NULL,
    "aiQuestion" TEXT NOT NULL,
    "aiReason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffPrecheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPrecheckEvidence" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "precheckId" UUID NOT NULL,
    "precheckItemId" UUID NOT NULL,
    "sourceType" "HandoffEvidenceSourceType" NOT NULL,
    "timelineInputId" UUID,
    "taskInputId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffPrecheckEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffPrecheckAnswer" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "precheckId" UUID NOT NULL,
    "precheckItemId" UUID NOT NULL,
    "answerCode" "HandoffAnswerCode" NOT NULL,
    "comment" TEXT,
    "answeredByActorId" UUID NOT NULL,
    "answeredAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoffPrecheckAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handoff" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "senderActorId" UUID NOT NULL,
    "receiverActorId" UUID NOT NULL,
    "senderShiftId" UUID NOT NULL,
    "receiverShiftId" UUID NOT NULL,
    "handoffDate" DATE NOT NULL,
    "targetDuty" "ShiftDuty" NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'GENERATING',
    "precheckId" UUID NOT NULL,
    "precheckVersion" INTEGER NOT NULL,
    "templateKey" VARCHAR(64) NOT NULL,
    "includeUnverified" BOOLEAN NOT NULL,
    "frozenInputPayload" JSONB NOT NULL,
    "frozenInputHash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Handoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffGenerationAttempt" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "aiJobId" UUID NOT NULL,
    "idempotencyRecordId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "requestId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "aiModelVersion" VARCHAR(100),
    "aiContractVersion" VARCHAR(100),
    "aiGeneratedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoffGenerationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffFrozenPrecheckItem" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "sourcePrecheckItemId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "severity" "HandoffItemSeverity" NOT NULL,
    "aiQuestion" TEXT NOT NULL,
    "answerCode" "HandoffAnswerCode",
    "answerComment" TEXT,
    "answeredByActorId" UUID,
    "answeredAt" TIMESTAMPTZ(3),
    "sourceItemVersion" INTEGER NOT NULL,
    "sourceAnswerVersion" INTEGER,
    "isWarningCandidate" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffFrozenPrecheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffFrozenPrecheckEvidence" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "frozenItemId" UUID NOT NULL,
    "sourceType" "HandoffEvidenceSourceType" NOT NULL,
    "sourceId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffFrozenPrecheckEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffDraftPatient" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoffDraftPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffDraftSection" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "draftPatientId" UUID NOT NULL,
    "section" "HandoffClinicalSection" NOT NULL,
    "aiOriginalText" TEXT NOT NULL,
    "currentText" TEXT NOT NULL,
    "isModified" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoffDraftSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffDraftCitation" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "draftPatientId" UUID NOT NULL,
    "draftSectionId" UUID NOT NULL,
    "sourceType" "HandoffEvidenceSourceType" NOT NULL,
    "sourceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffDraftCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffDraftLinkedTask" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "patientId" UUID,
    "title" VARCHAR(500) NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "effectivePriority" "HandoffTaskPriority" NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
    "linkedByActorId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoffDraftLinkedTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffDraftTaskSourceReference" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "linkedTaskId" UUID NOT NULL,
    "reference" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffDraftTaskSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffDraftWarning" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "precheckItemId" UUID,
    "warningType" "HandoffWarningType" NOT NULL,
    "message" TEXT NOT NULL,
    "isIncludedInAiInput" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoffDraftWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffFinalSnapshot" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "senderActorId" UUID NOT NULL,
    "receiverActorId" UUID NOT NULL,
    "finalizedByActorId" UUID NOT NULL,
    "resolution" "HandoffFinalizeResolution" NOT NULL,
    "sourceDraftVersion" INTEGER NOT NULL,
    "precheckVersion" INTEGER NOT NULL,
    "templateKey" VARCHAR(64) NOT NULL,
    "includeUnverified" BOOLEAN NOT NULL,
    "idempotencyRecordId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "snapshotPayload" JSONB NOT NULL,
    "snapshotHash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffFinalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffAcknowledgement" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "senderActorId" UUID NOT NULL,
    "receiverActorId" UUID NOT NULL,
    "status" "HandoffAcknowledgementStatus" NOT NULL,
    "comment" TEXT,
    "idempotencyRecordId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoffAuditEvent" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "senderActorId" UUID NOT NULL,
    "receiverActorId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "eventType" "HandoffAuditEventType" NOT NULL,
    "acknowledgementId" UUID,
    "deduplicationKey" VARCHAR(255),
    "eventPayload" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoffAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "patientId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "dueAt" TIMESTAMPTZ(3),
    "workDate" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "source" "TaskSource" NOT NULL,
    "aiSuggestedPriority" "TaskPriority",
    "aiReasons" TEXT[],
    "aiConfidence" "TaskAiConfidence",
    "rulePriority" "TaskPriority" NOT NULL,
    "confirmedPriority" "TaskPriority",
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCreateReceipt" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL DEFAULT 'tasks.create',
    "idempotencyRecordId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "responseSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCreateReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvidence" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "sourceType" "TaskEvidenceSourceType" NOT NULL,
    "timelineEventId" UUID,
    "sourceTaskId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPriorityAudit" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "TaskPriorityAuditAction" NOT NULL,
    "previousConfirmedPriority" "TaskPriority",
    "newConfirmedPriority" "TaskPriority",
    "aiSuggestedPriority" "TaskPriority",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPriorityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExtractionJob" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL DEFAULT 'tasks.extract',
    "roundingSessionId" UUID NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExtractionRequestReceipt" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "idempotencyRecordId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL DEFAULT 'tasks.extract',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExtractionRequestReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExtractionEvidence" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "roundingRecordId" UUID NOT NULL,
    "sourceType" "TaskEvidenceSourceType" NOT NULL,
    "timelineEventId" UUID,
    "sourceTaskId" UUID,
    "patientId" UUID,
    "workDate" DATE NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExtractionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExtractionCandidate" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "patientId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "dueAt" TIMESTAMPTZ(3),
    "workDate" DATE NOT NULL,
    "aiSuggestedPriority" "TaskPriority" NOT NULL,
    "aiReasons" TEXT[],
    "aiConfidence" "TaskAiConfidence" NOT NULL,
    "duplicateTaskId" UUID,
    "appliedTaskId" UUID,
    "applyReceiptId" UUID,
    "appliedByActorId" UUID,
    "appliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExtractionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExtractionCandidateEvidence" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExtractionCandidateEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskApplyReceipt" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL DEFAULT 'tasks.extract.apply',
    "idempotencyRecordId" UUID NOT NULL,
    "createdTaskIds" TEXT[],
    "skippedCandidateIds" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskApplyReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HandoffPrecheck_ai_job_id_key" ON "HandoffPrecheck"("aiJobId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheck_idempotency_record_id_key" ON "HandoffPrecheck"("idempotencyRecordId");

-- CreateIndex
CREATE INDEX "HandoffPrecheck_datasetId_wardId_senderActorId_createdAt_id_idx" ON "HandoffPrecheck"("datasetId", "wardId", "senderActorId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheck_datasetId_id_key" ON "HandoffPrecheck"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckPatientInput_datasetId_id_key" ON "HandoffPrecheckPatientInput"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckPatientInput_datasetId_precheckId_patientId_key" ON "HandoffPrecheckPatientInput"("datasetId", "precheckId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckPatientInput_datasetId_precheckId_position_key" ON "HandoffPrecheckPatientInput"("datasetId", "precheckId", "position");

-- CreateIndex
CREATE INDEX "HandoffPrecheckTimelineInput_datasetId_precheckId_patientId_idx" ON "HandoffPrecheckTimelineInput"("datasetId", "precheckId", "patientId", "occurredAt" DESC, "timelineEventId" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTimelineInput_datasetId_id_key" ON "HandoffPrecheckTimelineInput"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTimelineInput_datasetId_precheckId_id_key" ON "HandoffPrecheckTimelineInput"("datasetId", "precheckId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTimelineInput_datasetId_precheckId_timelineE_key" ON "HandoffPrecheckTimelineInput"("datasetId", "precheckId", "timelineEventId");

-- CreateIndex
CREATE INDEX "HandoffPrecheckTaskInput_datasetId_precheckId_patientId_due_idx" ON "HandoffPrecheckTaskInput"("datasetId", "precheckId", "patientId", "dueAt", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTaskInput_datasetId_id_key" ON "HandoffPrecheckTaskInput"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTaskInput_datasetId_precheckId_id_key" ON "HandoffPrecheckTaskInput"("datasetId", "precheckId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTaskInput_datasetId_precheckId_taskId_key" ON "HandoffPrecheckTaskInput"("datasetId", "precheckId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTaskSourceReference_datasetId_id_key" ON "HandoffPrecheckTaskSourceReference"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckTaskSourceReference_datasetId_precheckId_tas_key" ON "HandoffPrecheckTaskSourceReference"("datasetId", "precheckId", "taskInputId", "reference");

-- CreateIndex
CREATE INDEX "HandoffPrecheckItem_datasetId_precheckId_severity_position__idx" ON "HandoffPrecheckItem"("datasetId", "precheckId", "severity", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckItem_datasetId_id_key" ON "HandoffPrecheckItem"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckItem_datasetId_precheckId_id_key" ON "HandoffPrecheckItem"("datasetId", "precheckId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckItem_datasetId_precheckId_position_key" ON "HandoffPrecheckItem"("datasetId", "precheckId", "position");

-- CreateIndex
CREATE INDEX "HandoffPrecheckEvidence_datasetId_precheckId_precheckItemId_idx" ON "HandoffPrecheckEvidence"("datasetId", "precheckId", "precheckItemId", "sourceType", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckEvidence_datasetId_id_key" ON "HandoffPrecheckEvidence"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckEvidence_timeline_key" ON "HandoffPrecheckEvidence"("datasetId", "precheckId", "precheckItemId", "timelineInputId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckEvidence_task_key" ON "HandoffPrecheckEvidence"("datasetId", "precheckId", "precheckItemId", "taskInputId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckAnswer_datasetId_id_key" ON "HandoffPrecheckAnswer"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffPrecheckAnswer_datasetId_precheckId_precheckItemId_key" ON "HandoffPrecheckAnswer"("datasetId", "precheckId", "precheckItemId");

-- CreateIndex
CREATE INDEX "Handoff_datasetId_wardId_senderActorId_handoffDate_status_u_idx" ON "Handoff"("datasetId", "wardId", "senderActorId", "handoffDate", "status", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Handoff_datasetId_wardId_receiverActorId_handoffDate_status_idx" ON "Handoff"("datasetId", "wardId", "receiverActorId", "handoffDate", "status", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_datasetId_id_key" ON "Handoff"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_datasetId_wardId_id_key" ON "Handoff"("datasetId", "wardId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_datasetId_precheckId_key" ON "Handoff"("datasetId", "precheckId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffGenerationAttempt_ai_job_id_key" ON "HandoffGenerationAttempt"("aiJobId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffGenerationAttempt_idempotency_record_id_key" ON "HandoffGenerationAttempt"("idempotencyRecordId");

-- CreateIndex
CREATE INDEX "HandoffGenerationAttempt_datasetId_handoffId_sequence_id_idx" ON "HandoffGenerationAttempt"("datasetId", "handoffId", "sequence" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HandoffGenerationAttempt_datasetId_id_key" ON "HandoffGenerationAttempt"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffGenerationAttempt_datasetId_handoffId_sequence_key" ON "HandoffGenerationAttempt"("datasetId", "handoffId", "sequence");

-- CreateIndex
CREATE INDEX "HandoffFrozenPrecheckItem_datasetId_handoffId_severity_posi_idx" ON "HandoffFrozenPrecheckItem"("datasetId", "handoffId", "severity", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFrozenPrecheckItem_datasetId_id_key" ON "HandoffFrozenPrecheckItem"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFrozenPrecheckItem_datasetId_handoffId_id_key" ON "HandoffFrozenPrecheckItem"("datasetId", "handoffId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFrozenPrecheckItem_datasetId_handoffId_sourcePrechec_key" ON "HandoffFrozenPrecheckItem"("datasetId", "handoffId", "sourcePrecheckItemId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFrozenPrecheckItem_datasetId_handoffId_position_key" ON "HandoffFrozenPrecheckItem"("datasetId", "handoffId", "position");

-- CreateIndex
CREATE INDEX "HandoffFrozenPrecheckEvidence_datasetId_handoffId_frozenIte_idx" ON "HandoffFrozenPrecheckEvidence"("datasetId", "handoffId", "frozenItemId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFrozenPrecheckEvidence_datasetId_id_key" ON "HandoffFrozenPrecheckEvidence"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFrozenPrecheckEvidence_datasetId_handoffId_frozenIte_key" ON "HandoffFrozenPrecheckEvidence"("datasetId", "handoffId", "frozenItemId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftPatient_datasetId_id_key" ON "HandoffDraftPatient"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftPatient_datasetId_handoffId_id_key" ON "HandoffDraftPatient"("datasetId", "handoffId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftPatient_datasetId_handoffId_patientId_key" ON "HandoffDraftPatient"("datasetId", "handoffId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftPatient_datasetId_handoffId_position_key" ON "HandoffDraftPatient"("datasetId", "handoffId", "position");

-- CreateIndex
CREATE INDEX "HandoffDraftSection_datasetId_handoffId_draftPatientId_sect_idx" ON "HandoffDraftSection"("datasetId", "handoffId", "draftPatientId", "section", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftSection_datasetId_id_key" ON "HandoffDraftSection"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftSection_datasetId_handoffId_draftPatientId_id_key" ON "HandoffDraftSection"("datasetId", "handoffId", "draftPatientId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftSection_datasetId_handoffId_draftPatientId_sect_key" ON "HandoffDraftSection"("datasetId", "handoffId", "draftPatientId", "section");

-- CreateIndex
CREATE INDEX "HandoffDraftCitation_datasetId_handoffId_draftPatientId_dra_idx" ON "HandoffDraftCitation"("datasetId", "handoffId", "draftPatientId", "draftSectionId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftCitation_datasetId_id_key" ON "HandoffDraftCitation"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftCitation_datasetId_handoffId_draftSectionId_sou_key" ON "HandoffDraftCitation"("datasetId", "handoffId", "draftSectionId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftCitation_datasetId_handoffId_draftSectionId_pos_key" ON "HandoffDraftCitation"("datasetId", "handoffId", "draftSectionId", "position");

-- CreateIndex
CREATE INDEX "HandoffDraftLinkedTask_datasetId_handoffId_patientId_positi_idx" ON "HandoffDraftLinkedTask"("datasetId", "handoffId", "patientId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftLinkedTask_datasetId_id_key" ON "HandoffDraftLinkedTask"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftLinkedTask_datasetId_handoffId_id_key" ON "HandoffDraftLinkedTask"("datasetId", "handoffId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftLinkedTask_datasetId_handoffId_taskId_key" ON "HandoffDraftLinkedTask"("datasetId", "handoffId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftLinkedTask_datasetId_handoffId_position_key" ON "HandoffDraftLinkedTask"("datasetId", "handoffId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftTaskSourceReference_datasetId_id_key" ON "HandoffDraftTaskSourceReference"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftTaskSourceReference_datasetId_handoffId_linkedT_key" ON "HandoffDraftTaskSourceReference"("datasetId", "handoffId", "linkedTaskId", "reference");

-- CreateIndex
CREATE INDEX "HandoffDraftWarning_datasetId_handoffId_warningType_created_idx" ON "HandoffDraftWarning"("datasetId", "handoffId", "warningType", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftWarning_datasetId_id_key" ON "HandoffDraftWarning"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffDraftWarning_datasetId_handoffId_warningType_prechec_key" ON "HandoffDraftWarning"("datasetId", "handoffId", "warningType", "precheckItemId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFinalSnapshot_idempotency_record_id_key" ON "HandoffFinalSnapshot"("idempotencyRecordId");

-- CreateIndex
CREATE INDEX "HandoffFinalSnapshot_datasetId_wardId_senderActorId_finaliz_idx" ON "HandoffFinalSnapshot"("datasetId", "wardId", "senderActorId", "finalizedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "HandoffFinalSnapshot_datasetId_wardId_receiverActorId_final_idx" ON "HandoffFinalSnapshot"("datasetId", "wardId", "receiverActorId", "finalizedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFinalSnapshot_datasetId_id_key" ON "HandoffFinalSnapshot"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffFinalSnapshot_datasetId_handoffId_key" ON "HandoffFinalSnapshot"("datasetId", "handoffId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffAcknowledgement_idempotency_record_id_key" ON "HandoffAcknowledgement"("idempotencyRecordId");

-- CreateIndex
CREATE INDEX "HandoffAcknowledgement_datasetId_handoffId_status_createdAt_idx" ON "HandoffAcknowledgement"("datasetId", "handoffId", "status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "HandoffAcknowledgement_datasetId_wardId_receiverActorId_cre_idx" ON "HandoffAcknowledgement"("datasetId", "wardId", "receiverActorId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HandoffAcknowledgement_datasetId_id_key" ON "HandoffAcknowledgement"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffAcknowledgement_datasetId_handoffId_id_key" ON "HandoffAcknowledgement"("datasetId", "handoffId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffAcknowledgement_datasetId_handoffId_status_key" ON "HandoffAcknowledgement"("datasetId", "handoffId", "status");

-- CreateIndex
CREATE INDEX "HandoffAuditEvent_datasetId_handoffId_occurredAt_id_idx" ON "HandoffAuditEvent"("datasetId", "handoffId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "HandoffAuditEvent_datasetId_wardId_actorId_occurredAt_id_idx" ON "HandoffAuditEvent"("datasetId", "wardId", "actorId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HandoffAuditEvent_datasetId_id_key" ON "HandoffAuditEvent"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffAuditEvent_datasetId_handoffId_acknowledgementId_key" ON "HandoffAuditEvent"("datasetId", "handoffId", "acknowledgementId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoffAuditEvent_datasetId_handoffId_deduplicationKey_key" ON "HandoffAuditEvent"("datasetId", "handoffId", "deduplicationKey");

CREATE INDEX "Task_datasetId_wardId_actorId_workDate_status_patientId_idx" ON "Task"("datasetId", "wardId", "actorId", "workDate", "status", "patientId");

-- CreateIndex
CREATE INDEX "Task_datasetId_wardId_actorId_workDate_dueAt_createdAt_id_idx" ON "Task"("datasetId", "wardId", "actorId", "workDate", "dueAt", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Task_datasetId_wardId_patientId_status_dueAt_createdAt_id_idx" ON "Task"("datasetId", "wardId", "patientId", "status", "dueAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Task_datasetId_id_key" ON "Task"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCreateReceipt_idempotencyRecordId_key" ON "TaskCreateReceipt"("idempotencyRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCreateReceipt_taskId_key" ON "TaskCreateReceipt"("taskId");

-- CreateIndex
CREATE INDEX "TaskCreateReceipt_datasetId_actorId_wardId_createdAt_idx" ON "TaskCreateReceipt"("datasetId", "actorId", "wardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCreateReceipt_datasetId_id_key" ON "TaskCreateReceipt"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCreateReceipt_datasetId_taskId_key" ON "TaskCreateReceipt"("datasetId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCreateReceipt_datasetId_idempotencyRecordId_actorId_war_key" ON "TaskCreateReceipt"("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation");

-- CreateIndex
CREATE INDEX "TaskEvidence_datasetId_timelineEventId_idx" ON "TaskEvidence"("datasetId", "timelineEventId");

-- CreateIndex
CREATE INDEX "TaskEvidence_datasetId_sourceTaskId_idx" ON "TaskEvidence"("datasetId", "sourceTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEvidence_datasetId_id_key" ON "TaskEvidence"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEvidence_datasetId_taskId_timelineEventId_key" ON "TaskEvidence"("datasetId", "taskId", "timelineEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEvidence_datasetId_taskId_sourceTaskId_key" ON "TaskEvidence"("datasetId", "taskId", "sourceTaskId");

-- CreateIndex
CREATE INDEX "TaskPriorityAudit_datasetId_taskId_createdAt_id_idx" ON "TaskPriorityAudit"("datasetId", "taskId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskPriorityAudit_datasetId_id_key" ON "TaskPriorityAudit"("datasetId", "id");

-- CreateIndex
CREATE INDEX "TaskExtractionJob_datasetId_wardId_actorId_createdAt_id_idx" ON "TaskExtractionJob"("datasetId", "wardId", "actorId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionJob_datasetId_id_key" ON "TaskExtractionJob"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionJob_datasetId_id_actorId_wardId_key" ON "TaskExtractionJob"("datasetId", "id", "actorId", "wardId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionJob_datasetId_id_actorId_wardId_operation_key" ON "TaskExtractionJob"("datasetId", "id", "actorId", "wardId", "operation");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionRequestReceipt_idempotencyRecordId_key" ON "TaskExtractionRequestReceipt"("idempotencyRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionRequestReceipt_jobId_key" ON "TaskExtractionRequestReceipt"("jobId");

-- CreateIndex
CREATE INDEX "TaskExtractionRequestReceipt_datasetId_actorId_wardId_creat_idx" ON "TaskExtractionRequestReceipt"("datasetId", "actorId", "wardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionRequestReceipt_datasetId_id_key" ON "TaskExtractionRequestReceipt"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionRequestReceipt_datasetId_jobId_actorId_wardId_key" ON "TaskExtractionRequestReceipt"("datasetId", "jobId", "actorId", "wardId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionRequestReceipt_datasetId_idempotencyRecordId__key" ON "TaskExtractionRequestReceipt"("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation");

-- CreateIndex
CREATE INDEX "TaskExtractionEvidence_datasetId_jobId_createdAt_id_idx" ON "TaskExtractionEvidence"("datasetId", "jobId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TaskExtractionEvidence_datasetId_jobId_roundingRecordId_idx" ON "TaskExtractionEvidence"("datasetId", "jobId", "roundingRecordId");

-- CreateIndex
CREATE INDEX "TaskExtractionEvidence_datasetId_timelineEventId_idx" ON "TaskExtractionEvidence"("datasetId", "timelineEventId");

-- CreateIndex
CREATE INDEX "TaskExtractionEvidence_datasetId_sourceTaskId_idx" ON "TaskExtractionEvidence"("datasetId", "sourceTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionEvidence_datasetId_id_jobId_key" ON "TaskExtractionEvidence"("datasetId", "id", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionEvidence_datasetId_jobId_roundingRecordId_tim_key" ON "TaskExtractionEvidence"("datasetId", "jobId", "roundingRecordId", "timelineEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionEvidence_datasetId_jobId_roundingRecordId_sou_key" ON "TaskExtractionEvidence"("datasetId", "jobId", "roundingRecordId", "sourceTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionCandidate_appliedTaskId_key" ON "TaskExtractionCandidate"("appliedTaskId");

-- CreateIndex
CREATE INDEX "TaskExtractionCandidate_datasetId_jobId_createdAt_id_idx" ON "TaskExtractionCandidate"("datasetId", "jobId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TaskExtractionCandidate_datasetId_duplicateTaskId_idx" ON "TaskExtractionCandidate"("datasetId", "duplicateTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionCandidate_datasetId_id_jobId_key" ON "TaskExtractionCandidate"("datasetId", "id", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionCandidate_datasetId_appliedTaskId_key" ON "TaskExtractionCandidate"("datasetId", "appliedTaskId");

-- CreateIndex
CREATE INDEX "TaskExtractionCandidateEvidence_datasetId_jobId_candidateId_idx" ON "TaskExtractionCandidateEvidence"("datasetId", "jobId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionCandidateEvidence_datasetId_id_key" ON "TaskExtractionCandidateEvidence"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExtractionCandidateEvidence_datasetId_candidateId_evide_key" ON "TaskExtractionCandidateEvidence"("datasetId", "candidateId", "evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskApplyReceipt_idempotencyRecordId_key" ON "TaskApplyReceipt"("idempotencyRecordId");

-- CreateIndex
CREATE INDEX "TaskApplyReceipt_datasetId_jobId_actorId_createdAt_idx" ON "TaskApplyReceipt"("datasetId", "jobId", "actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskApplyReceipt_datasetId_id_key" ON "TaskApplyReceipt"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskApplyReceipt_datasetId_jobId_id_key" ON "TaskApplyReceipt"("datasetId", "jobId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskApplyReceipt_datasetId_idempotencyRecordId_actorId_ward_key" ON "TaskApplyReceipt"("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation");
ALTER TABLE "HandoffPrecheckPatientInput" ADD CONSTRAINT "HandoffPrecheckPatientInput_datasetId_precheckId_fkey" FOREIGN KEY ("datasetId", "precheckId") REFERENCES "HandoffPrecheck"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckTimelineInput" ADD CONSTRAINT "HandoffPrecheckTimelineInput_datasetId_precheckId_fkey" FOREIGN KEY ("datasetId", "precheckId") REFERENCES "HandoffPrecheck"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckTaskInput" ADD CONSTRAINT "HandoffPrecheckTaskInput_datasetId_precheckId_fkey" FOREIGN KEY ("datasetId", "precheckId") REFERENCES "HandoffPrecheck"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckTaskSourceReference" ADD CONSTRAINT "HandoffPrecheckTaskSourceReference_datasetId_precheckId_ta_fkey" FOREIGN KEY ("datasetId", "precheckId", "taskInputId") REFERENCES "HandoffPrecheckTaskInput"("datasetId", "precheckId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckItem" ADD CONSTRAINT "HandoffPrecheckItem_datasetId_precheckId_fkey" FOREIGN KEY ("datasetId", "precheckId") REFERENCES "HandoffPrecheck"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckEvidence" ADD CONSTRAINT "HandoffPrecheckEvidence_datasetId_precheckId_precheckItemI_fkey" FOREIGN KEY ("datasetId", "precheckId", "precheckItemId") REFERENCES "HandoffPrecheckItem"("datasetId", "precheckId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckEvidence" ADD CONSTRAINT "HandoffPrecheckEvidence_datasetId_precheckId_timelineInput_fkey" FOREIGN KEY ("datasetId", "precheckId", "timelineInputId") REFERENCES "HandoffPrecheckTimelineInput"("datasetId", "precheckId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckEvidence" ADD CONSTRAINT "HandoffPrecheckEvidence_datasetId_precheckId_taskInputId_fkey" FOREIGN KEY ("datasetId", "precheckId", "taskInputId") REFERENCES "HandoffPrecheckTaskInput"("datasetId", "precheckId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffPrecheckAnswer" ADD CONSTRAINT "HandoffPrecheckAnswer_datasetId_precheckId_precheckItemId_fkey" FOREIGN KEY ("datasetId", "precheckId", "precheckItemId") REFERENCES "HandoffPrecheckItem"("datasetId", "precheckId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_datasetId_precheckId_fkey" FOREIGN KEY ("datasetId", "precheckId") REFERENCES "HandoffPrecheck"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffGenerationAttempt" ADD CONSTRAINT "HandoffGenerationAttempt_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffFrozenPrecheckItem" ADD CONSTRAINT "HandoffFrozenPrecheckItem_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffFrozenPrecheckEvidence" ADD CONSTRAINT "HandoffFrozenPrecheckEvidence_datasetId_handoffId_frozenIt_fkey" FOREIGN KEY ("datasetId", "handoffId", "frozenItemId") REFERENCES "HandoffFrozenPrecheckItem"("datasetId", "handoffId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffDraftPatient" ADD CONSTRAINT "HandoffDraftPatient_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffDraftSection" ADD CONSTRAINT "HandoffDraftSection_datasetId_handoffId_draftPatientId_fkey" FOREIGN KEY ("datasetId", "handoffId", "draftPatientId") REFERENCES "HandoffDraftPatient"("datasetId", "handoffId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffDraftCitation" ADD CONSTRAINT "HandoffDraftCitation_datasetId_handoffId_draftPatientId_dr_fkey" FOREIGN KEY ("datasetId", "handoffId", "draftPatientId", "draftSectionId") REFERENCES "HandoffDraftSection"("datasetId", "handoffId", "draftPatientId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffDraftLinkedTask" ADD CONSTRAINT "HandoffDraftLinkedTask_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffDraftTaskSourceReference" ADD CONSTRAINT "HandoffDraftTaskSourceReference_datasetId_handoffId_linked_fkey" FOREIGN KEY ("datasetId", "handoffId", "linkedTaskId") REFERENCES "HandoffDraftLinkedTask"("datasetId", "handoffId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffDraftWarning" ADD CONSTRAINT "HandoffDraftWarning_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffFinalSnapshot" ADD CONSTRAINT "HandoffFinalSnapshot_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffAcknowledgement" ADD CONSTRAINT "HandoffAcknowledgement_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffAuditEvent" ADD CONSTRAINT "HandoffAuditEvent_datasetId_handoffId_fkey" FOREIGN KEY ("datasetId", "handoffId") REFERENCES "Handoff"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffAuditEvent" ADD CONSTRAINT "HandoffAuditEvent_datasetId_handoffId_acknowledgementId_fkey" FOREIGN KEY ("datasetId", "handoffId", "acknowledgementId") REFERENCES "HandoffAcknowledgement"("datasetId", "handoffId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskCreateReceipt" ADD CONSTRAINT "TaskCreateReceipt_datasetId_taskId_fkey" FOREIGN KEY ("datasetId", "taskId") REFERENCES "Task"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_datasetId_taskId_fkey" FOREIGN KEY ("datasetId", "taskId") REFERENCES "Task"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvidence" ADD CONSTRAINT "TaskEvidence_datasetId_sourceTaskId_fkey" FOREIGN KEY ("datasetId", "sourceTaskId") REFERENCES "Task"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPriorityAudit" ADD CONSTRAINT "TaskPriorityAudit_datasetId_taskId_fkey" FOREIGN KEY ("datasetId", "taskId") REFERENCES "Task"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionRequestReceipt" ADD CONSTRAINT "TaskExtractionRequestReceipt_datasetId_jobId_actorId_wardI_fkey" FOREIGN KEY ("datasetId", "jobId", "actorId", "wardId") REFERENCES "TaskExtractionJob"("datasetId", "id", "actorId", "wardId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionEvidence" ADD CONSTRAINT "TaskExtractionEvidence_datasetId_jobId_fkey" FOREIGN KEY ("datasetId", "jobId") REFERENCES "TaskExtractionJob"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionEvidence" ADD CONSTRAINT "TaskExtractionEvidence_datasetId_sourceTaskId_fkey" FOREIGN KEY ("datasetId", "sourceTaskId") REFERENCES "Task"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionCandidate" ADD CONSTRAINT "TaskExtractionCandidate_datasetId_jobId_fkey" FOREIGN KEY ("datasetId", "jobId") REFERENCES "TaskExtractionJob"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionCandidate" ADD CONSTRAINT "TaskExtractionCandidate_datasetId_duplicateTaskId_fkey" FOREIGN KEY ("datasetId", "duplicateTaskId") REFERENCES "Task"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionCandidate" ADD CONSTRAINT "TaskExtractionCandidate_datasetId_appliedTaskId_fkey" FOREIGN KEY ("datasetId", "appliedTaskId") REFERENCES "Task"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionCandidate" ADD CONSTRAINT "TaskExtractionCandidate_datasetId_jobId_applyReceiptId_fkey" FOREIGN KEY ("datasetId", "jobId", "applyReceiptId") REFERENCES "TaskApplyReceipt"("datasetId", "jobId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionCandidateEvidence" ADD CONSTRAINT "TaskExtractionCandidateEvidence_datasetId_candidateId_jobI_fkey" FOREIGN KEY ("datasetId", "candidateId", "jobId") REFERENCES "TaskExtractionCandidate"("datasetId", "id", "jobId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExtractionCandidateEvidence" ADD CONSTRAINT "TaskExtractionCandidateEvidence_datasetId_evidenceId_jobId_fkey" FOREIGN KEY ("datasetId", "evidenceId", "jobId") REFERENCES "TaskExtractionEvidence"("datasetId", "id", "jobId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskApplyReceipt" ADD CONSTRAINT "TaskApplyReceipt_datasetId_jobId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "jobId", "actorId", "wardId") REFERENCES "TaskExtractionJob"("datasetId", "id", "actorId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
