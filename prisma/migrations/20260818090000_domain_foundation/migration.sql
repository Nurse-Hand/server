-- CreateEnum
CREATE TYPE "DemoDatasetKind" AS ENUM ('SYNTHETIC');
CREATE TYPE "WardMembershipRole" AS ENUM ('SENDER', 'RECEIVER');
CREATE TYPE "ShiftDuty" AS ENUM ('DAY', 'EVENING', 'NIGHT');
CREATE TYPE "TimelineEventSource" AS ENUM ('MANUAL', 'AI_AUDIO');
CREATE TYPE "TimelineEventType" AS ENUM ('OBSERVATION', 'MEDICATION', 'PROCEDURE', 'REPORT', 'TASK');
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED');

-- CreateTable
CREATE TABLE "DemoDataset" (
    "id" UUID NOT NULL,
    "kind" "DemoDatasetKind" NOT NULL DEFAULT 'SYNTHETIC',
    "scenarioKey" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoDataset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Nurse" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Nurse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ward" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WardMembership" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "nurseId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "role" "WardMembershipRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WardMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NurseShift" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "nurseId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "duty" "ShiftDuty" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NurseShift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NurseShift_time_check" CHECK ("endsAt" > "startsAt")
);

CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "wardId" UUID NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "roomLabel" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientAssignment" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "patientId" UUID NOT NULL,
    "nurseId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "nurseShiftId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientAssignment_time_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "TimelineEvent" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "patientId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "source" "TimelineEventSource" NOT NULL,
    "sourceReference" VARCHAR(128) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TimelineEvent_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "DemoSession" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "tokenDigest" CHAR(64) NOT NULL,
    "actorNurseId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DemoSession_token_digest_check" CHECK ("tokenDigest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "DemoSession_ttl_check" CHECK (
      "expiresAt" > "createdAt"
      AND "expiresAt" <= "createdAt" + INTERVAL '7 hours'
    )
);

CREATE TABLE "AiJob" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "idempotencyRecordId" UUID NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "requestId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "claimedAt" TIMESTAMPTZ(3),
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "leaseVersion" INTEGER NOT NULL DEFAULT 0,
    "failureCode" VARCHAR(64),
    "retryable" BOOLEAN,
    "resultReference" VARCHAR(255),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiJob_attempt_check" CHECK (
      "attempt" >= 0 AND "maxAttempts" BETWEEN 1 AND 10 AND "attempt" <= "maxAttempts"
    ),
    CONSTRAINT "AiJob_version_check" CHECK ("version" >= 1 AND "leaseVersion" >= 0),
    CONSTRAINT "AiJob_state_check" CHECK (
      (
        "status" = 'QUEUED'
        AND "attempt" = 0
        AND "claimedAt" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "leaseVersion" = 0
        AND "failureCode" IS NULL
        AND "retryable" IS NULL
        AND "resultReference" IS NULL
      ) OR (
        "status" = 'PROCESSING'
        AND "attempt" >= 1
        AND "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" > "claimedAt"
        AND "leaseVersion" >= 1
        AND "failureCode" IS NULL
        AND "retryable" IS NULL
        AND "resultReference" IS NULL
      ) OR (
        "status" = 'SUCCEEDED'
        AND "attempt" >= 1
        AND "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" > "claimedAt"
        AND "leaseVersion" >= 1
        AND "failureCode" IS NULL
        AND "retryable" IS NULL
        AND "resultReference" IS NOT NULL
      ) OR (
        "status" = 'FAILED'
        AND "attempt" >= 1
        AND "claimedAt" IS NOT NULL
        AND "leaseExpiresAt" > "claimedAt"
        AND "leaseVersion" >= 1
        AND "failureCode" ~ '^[A-Z][A-Z0-9_]{0,63}$'
        AND "retryable" IS NOT NULL
        AND "resultReference" IS NULL
      )
    )
);

CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "resultReference" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdempotencyRecord_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "IdempotencyRecord_state_check" CHECK (
      ("status" = 'PROCESSING' AND "resultReference" IS NULL)
      OR ("status" = 'COMPLETED' AND "resultReference" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "Nurse_datasetId_id_key" ON "Nurse"("datasetId", "id");
CREATE UNIQUE INDEX "Nurse_datasetId_logicalKey_key" ON "Nurse"("datasetId", "logicalKey");
CREATE UNIQUE INDEX "Ward_datasetId_id_key" ON "Ward"("datasetId", "id");
CREATE UNIQUE INDEX "Ward_datasetId_logicalKey_key" ON "Ward"("datasetId", "logicalKey");
CREATE UNIQUE INDEX "Ward_datasetId_code_key" ON "Ward"("datasetId", "code");
CREATE UNIQUE INDEX "WardMembership_datasetId_id_key" ON "WardMembership"("datasetId", "id");
CREATE UNIQUE INDEX "WardMembership_datasetId_logicalKey_key" ON "WardMembership"("datasetId", "logicalKey");
CREATE UNIQUE INDEX "WardMembership_datasetId_nurseId_wardId_key" ON "WardMembership"("datasetId", "nurseId", "wardId");
CREATE UNIQUE INDEX "NurseShift_datasetId_id_key" ON "NurseShift"("datasetId", "id");
CREATE UNIQUE INDEX "NurseShift_datasetId_logicalKey_key" ON "NurseShift"("datasetId", "logicalKey");
CREATE UNIQUE INDEX "NurseShift_datasetId_id_nurseId_wardId_key" ON "NurseShift"("datasetId", "id", "nurseId", "wardId");
CREATE INDEX "NurseShift_datasetId_nurseId_startsAt_endsAt_idx" ON "NurseShift"("datasetId", "nurseId", "startsAt", "endsAt");
CREATE UNIQUE INDEX "Patient_datasetId_id_key" ON "Patient"("datasetId", "id");
CREATE UNIQUE INDEX "Patient_datasetId_logicalKey_key" ON "Patient"("datasetId", "logicalKey");
CREATE UNIQUE INDEX "Patient_datasetId_id_wardId_key" ON "Patient"("datasetId", "id", "wardId");
CREATE INDEX "Patient_datasetId_wardId_id_idx" ON "Patient"("datasetId", "wardId", "id");
CREATE UNIQUE INDEX "PatientAssignment_datasetId_id_key" ON "PatientAssignment"("datasetId", "id");
CREATE UNIQUE INDEX "PatientAssignment_datasetId_logicalKey_key" ON "PatientAssignment"("datasetId", "logicalKey");
CREATE UNIQUE INDEX "PatientAssignment_datasetId_patientId_nurseShiftId_key" ON "PatientAssignment"("datasetId", "patientId", "nurseShiftId");
CREATE INDEX "PatientAssignment_datasetId_nurseId_wardId_patientId_idx" ON "PatientAssignment"("datasetId", "nurseId", "wardId", "patientId");
CREATE UNIQUE INDEX "TimelineEvent_datasetId_id_key" ON "TimelineEvent"("datasetId", "id");
CREATE UNIQUE INDEX "TimelineEvent_datasetId_logicalKey_key" ON "TimelineEvent"("datasetId", "logicalKey");
CREATE INDEX "TimelineEvent_datasetId_wardId_patientId_occurredAt_id_idx" ON "TimelineEvent"("datasetId", "wardId", "patientId", "occurredAt" DESC, "id" DESC);
CREATE UNIQUE INDEX "DemoSession_datasetId_actorNurseId_key" ON "DemoSession"("datasetId", "actorNurseId");
CREATE UNIQUE INDEX "DemoSession_tokenDigest_key" ON "DemoSession"("tokenDigest");
CREATE INDEX "DemoSession_expiresAt_idx" ON "DemoSession"("expiresAt");
CREATE UNIQUE INDEX "AiJob_idempotency_record_id_key" ON "AiJob"("idempotencyRecordId");
CREATE UNIQUE INDEX "AiJob_datasetId_id_key" ON "AiJob"("datasetId", "id");
CREATE UNIQUE INDEX "AiJob_datasetId_id_actorId_wardId_operation_key" ON "AiJob"("datasetId", "id", "actorId", "wardId", "operation");
CREATE UNIQUE INDEX "AiJob_idempotency_scope_key" ON "AiJob"("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation");
CREATE INDEX "AiJob_datasetId_wardId_status_leaseExpiresAt_createdAt_id_idx" ON "AiJob"("datasetId", "wardId", "status", "leaseExpiresAt", "createdAt", "id");
CREATE UNIQUE INDEX "IdempotencyRecord_datasetId_id_key" ON "IdempotencyRecord"("datasetId", "id");
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key" ON "IdempotencyRecord"("datasetId", "id", "actorId", "wardId", "operation");
CREATE UNIQUE INDEX "IdempotencyRecord_datasetId_actorId_operation_idempotencyKe_key" ON "IdempotencyRecord"("datasetId", "actorId", "operation", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Nurse" ADD CONSTRAINT "Nurse_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WardMembership" ADD CONSTRAINT "WardMembership_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WardMembership" ADD CONSTRAINT "WardMembership_datasetId_nurseId_fkey" FOREIGN KEY ("datasetId", "nurseId") REFERENCES "Nurse"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WardMembership" ADD CONSTRAINT "WardMembership_datasetId_wardId_fkey" FOREIGN KEY ("datasetId", "wardId") REFERENCES "Ward"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NurseShift" ADD CONSTRAINT "NurseShift_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NurseShift" ADD CONSTRAINT "NurseShift_datasetId_nurseId_wardId_fkey" FOREIGN KEY ("datasetId", "nurseId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_datasetId_wardId_fkey" FOREIGN KEY ("datasetId", "wardId") REFERENCES "Ward"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_datasetId_patientId_wardId_fkey" FOREIGN KEY ("datasetId", "patientId", "wardId") REFERENCES "Patient"("datasetId", "id", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientAssignment" ADD CONSTRAINT "PatientAssignment_datasetId_nurseShiftId_nurseId_wardId_fkey" FOREIGN KEY ("datasetId", "nurseShiftId", "nurseId", "wardId") REFERENCES "NurseShift"("datasetId", "id", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_datasetId_patientId_wardId_fkey" FOREIGN KEY ("datasetId", "patientId", "wardId") REFERENCES "Patient"("datasetId", "id", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_datasetId_wardId_fkey" FOREIGN KEY ("datasetId", "wardId") REFERENCES "Ward"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_datasetId_actorNurseId_wardId_fkey" FOREIGN KEY ("datasetId", "actorNurseId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_idempotency_scope_fkey" FOREIGN KEY ("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation") REFERENCES "IdempotencyRecord"("datasetId", "id", "actorId", "wardId", "operation") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Terminal AiJob rows are immutable, including no-op or metadata-only updates.
CREATE FUNCTION "reject_terminal_ai_job_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" IN ('SUCCEEDED', 'FAILED') THEN
    RAISE EXCEPTION 'terminal AiJob rows are immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AiJob_terminal_update_guard"
BEFORE UPDATE ON "AiJob"
FOR EACH ROW
EXECUTE FUNCTION "reject_terminal_ai_job_update"();
