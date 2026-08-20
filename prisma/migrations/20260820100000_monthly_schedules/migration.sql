-- CreateEnum
CREATE TYPE "ScheduleDuty" AS ENUM ('DAY', 'EVENING', 'NIGHT', 'OFF');

-- CreateTable
CREATE TABLE "MonthlySchedule" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "yearMonth" CHAR(7) NOT NULL,
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

CREATE TABLE "MonthlyScheduleReceipt" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL DEFAULT 'monthly-schedules.put',
    "idempotencyRecordId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "responseSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyScheduleReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySchedule_datasetId_actorId_wardId_yearMonth_key" ON "MonthlySchedule"("datasetId", "actorId", "wardId", "yearMonth");
CREATE UNIQUE INDEX "MonthlySchedule_datasetId_id_actorId_wardId_key" ON "MonthlySchedule"("datasetId", "id", "actorId", "wardId");
CREATE UNIQUE INDEX "MonthlySchedule_datasetId_id_key" ON "MonthlySchedule"("datasetId", "id");
CREATE UNIQUE INDEX "MonthlyScheduleEntry_scheduleId_dutyDate_key" ON "MonthlyScheduleEntry"("scheduleId", "dutyDate");
CREATE INDEX "MonthlyScheduleEntry_datasetId_scheduleId_dutyDate_idx" ON "MonthlyScheduleEntry"("datasetId", "scheduleId", "dutyDate");
CREATE UNIQUE INDEX "MonthlyScheduleReceipt_idempotencyRecordId_key" ON "MonthlyScheduleReceipt"("idempotencyRecordId");
CREATE UNIQUE INDEX "MonthlyScheduleReceipt_datasetId_idempotencyRecordId_actorId_wardId_operation_key" ON "MonthlyScheduleReceipt"("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation");
CREATE INDEX "MonthlyScheduleReceipt_datasetId_actorId_wardId_createdAt_idx" ON "MonthlyScheduleReceipt"("datasetId", "actorId", "wardId", "createdAt");

-- AddForeignKey
ALTER TABLE "MonthlySchedule" ADD CONSTRAINT "MonthlySchedule_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlySchedule" ADD CONSTRAINT "MonthlySchedule_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthlyScheduleEntry" ADD CONSTRAINT "MonthlyScheduleEntry_datasetId_scheduleId_fkey" FOREIGN KEY ("datasetId", "scheduleId") REFERENCES "MonthlySchedule"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyScheduleReceipt" ADD CONSTRAINT "MonthlyScheduleReceipt_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyScheduleReceipt" ADD CONSTRAINT "MonthlyScheduleReceipt_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthlyScheduleReceipt" ADD CONSTRAINT "MonthlyScheduleReceipt_idempotency_scope_fkey" FOREIGN KEY ("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation") REFERENCES "IdempotencyRecord"("datasetId", "id", "actorId", "wardId", "operation") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyScheduleReceipt" ADD CONSTRAINT "MonthlyScheduleReceipt_schedule_scope_fkey" FOREIGN KEY ("datasetId", "scheduleId", "actorId", "wardId") REFERENCES "MonthlySchedule"("datasetId", "id", "actorId", "wardId") ON DELETE CASCADE ON UPDATE CASCADE;
