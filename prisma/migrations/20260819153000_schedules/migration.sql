-- CreateEnum
CREATE TYPE "ScheduleDuty" AS ENUM ('DAY', 'EVENING', 'NIGHT', 'OFF');
CREATE TYPE "ScheduleOcrToken" AS ENUM ('D', 'E', 'N', 'OFF', 'UNKNOWN');

-- Composite parent key for fail-closed schedule scope relations.
CREATE UNIQUE INDEX "AiJob_dataset_scope_key"
ON "AiJob"("datasetId", "id", "actorId", "wardId");

-- CreateTable
CREATE TABLE "ScheduleOcrJob" (
    "aiJobId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "yearMonth" CHAR(7) NOT NULL,
    "templateId" VARCHAR(64) NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "fileHash" CHAR(64) NOT NULL,
    "storageUri" VARCHAR(500),
    "imageWidth" INTEGER NOT NULL,
    "imageHeight" INTEGER NOT NULL,
    "resultExpiresAt" TIMESTAMPTZ(3),
    "cleanupPendingStatus" "AiJobStatus",
    "cleanupPendingFailureCode" VARCHAR(64),
    "cleanupPendingRetryable" BOOLEAN,
    "cleanupPendingResultExpiresAt" TIMESTAMPTZ(3),
    "cleanupLeaseVersion" INTEGER,
    "cleanupFailedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduleOcrJob_pkey" PRIMARY KEY ("aiJobId"),
    CONSTRAINT "ScheduleOcrJob_year_month_check" CHECK ("yearMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "ScheduleOcrJob_file_hash_check" CHECK ("fileHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ScheduleOcrJob_image_check" CHECK ("imageWidth" > 0 AND "imageHeight" > 0 AND "rowIndex" >= 0),
    CONSTRAINT "ScheduleOcrJob_cleanup_check" CHECK (
      ("cleanupFailedAt" IS NULL OR "storageUri" IS NOT NULL)
      AND ("cleanupLeaseVersion" IS NULL OR "cleanupLeaseVersion" >= 1)
    )
);

CREATE TABLE "ScheduleOcrCell" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "aiJobId" UUID NOT NULL,
    "dutyDate" DATE NOT NULL,
    "token" "ScheduleOcrToken" NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "needsReview" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleOcrCell_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleOcrCell_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

CREATE TABLE "MonthlySchedule" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "yearMonth" CHAR(7) NOT NULL,
    "sourceJobId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonthlySchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MonthlySchedule_year_month_check" CHECK ("yearMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "MonthlySchedule_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "MonthlyScheduleEntry" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "dutyDate" DATE NOT NULL,
    "duty" "ScheduleDuty" NOT NULL,

    CONSTRAINT "MonthlyScheduleEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleSaveRequest" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "yearMonth" CHAR(7) NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "scheduleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleSaveRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleSaveRequest_year_month_check" CHECK ("yearMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "ScheduleSaveRequest_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$')
);

-- CreateIndex
CREATE INDEX "ScheduleOcrJob_datasetId_actorId_wardId_yearMonth_createdAt_idx" ON "ScheduleOcrJob"("datasetId", "actorId", "wardId", "yearMonth", "createdAt" DESC);
CREATE INDEX "ScheduleOcrJob_storageUri_createdAt_idx" ON "ScheduleOcrJob"("storageUri", "createdAt");
CREATE INDEX "ScheduleOcrJob_cleanupFailedAt_idx" ON "ScheduleOcrJob"("cleanupFailedAt");
CREATE INDEX "ScheduleOcrJob_resultExpiresAt_idx" ON "ScheduleOcrJob"("resultExpiresAt");
CREATE UNIQUE INDEX "ScheduleOcrJob_datasetId_aiJobId_actorId_wardId_key" ON "ScheduleOcrJob"("datasetId", "aiJobId", "actorId", "wardId");
CREATE UNIQUE INDEX "ScheduleOcrJob_datasetId_aiJobId_key" ON "ScheduleOcrJob"("datasetId", "aiJobId");
CREATE INDEX "ScheduleOcrCell_aiJobId_dutyDate_idx" ON "ScheduleOcrCell"("aiJobId", "dutyDate");
CREATE UNIQUE INDEX "ScheduleOcrCell_aiJobId_dutyDate_key" ON "ScheduleOcrCell"("aiJobId", "dutyDate");
CREATE UNIQUE INDEX "MonthlySchedule_datasetId_actorId_wardId_yearMonth_key" ON "MonthlySchedule"("datasetId", "actorId", "wardId", "yearMonth");
CREATE UNIQUE INDEX "MonthlySchedule_datasetId_id_actorId_wardId_key" ON "MonthlySchedule"("datasetId", "id", "actorId", "wardId");
CREATE UNIQUE INDEX "MonthlySchedule_datasetId_id_key" ON "MonthlySchedule"("datasetId", "id");
CREATE INDEX "MonthlyScheduleEntry_scheduleId_dutyDate_idx" ON "MonthlyScheduleEntry"("scheduleId", "dutyDate");
CREATE UNIQUE INDEX "MonthlyScheduleEntry_scheduleId_dutyDate_key" ON "MonthlyScheduleEntry"("scheduleId", "dutyDate");
CREATE INDEX "ScheduleSaveRequest_scheduleId_idx" ON "ScheduleSaveRequest"("scheduleId");
CREATE UNIQUE INDEX "ScheduleSaveRequest_datasetId_actorId_yearMonth_idempotency_key" ON "ScheduleSaveRequest"("datasetId", "actorId", "yearMonth", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ScheduleOcrJob" ADD CONSTRAINT "ScheduleOcrJob_ai_job_scope_fkey" FOREIGN KEY ("datasetId", "aiJobId", "actorId", "wardId") REFERENCES "AiJob"("datasetId", "id", "actorId", "wardId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleOcrJob" ADD CONSTRAINT "ScheduleOcrJob_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleOcrJob" ADD CONSTRAINT "ScheduleOcrJob_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleOcrCell" ADD CONSTRAINT "ScheduleOcrCell_datasetId_aiJobId_fkey" FOREIGN KEY ("datasetId", "aiJobId") REFERENCES "ScheduleOcrJob"("datasetId", "aiJobId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlySchedule" ADD CONSTRAINT "MonthlySchedule_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlySchedule" ADD CONSTRAINT "MonthlySchedule_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthlySchedule" ADD CONSTRAINT "MonthlySchedule_source_job_scope_fkey" FOREIGN KEY ("datasetId", "sourceJobId", "actorId", "wardId") REFERENCES "ScheduleOcrJob"("datasetId", "aiJobId", "actorId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthlyScheduleEntry" ADD CONSTRAINT "MonthlyScheduleEntry_datasetId_scheduleId_fkey" FOREIGN KEY ("datasetId", "scheduleId") REFERENCES "MonthlySchedule"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleSaveRequest" ADD CONSTRAINT "ScheduleSaveRequest_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleSaveRequest" ADD CONSTRAINT "ScheduleSaveRequest_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleSaveRequest" ADD CONSTRAINT "ScheduleSaveRequest_schedule_scope_fkey" FOREIGN KEY ("datasetId", "scheduleId", "actorId", "wardId") REFERENCES "MonthlySchedule"("datasetId", "id", "actorId", "wardId") ON DELETE CASCADE ON UPDATE CASCADE;
