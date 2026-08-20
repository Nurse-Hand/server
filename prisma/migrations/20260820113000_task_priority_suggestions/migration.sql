-- CreateEnum
CREATE TYPE "TaskPrioritySuggestionBatchStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "TaskPriorityAudit" ADD COLUMN "prioritySuggestionId" UUID;

-- CreateTable
CREATE TABLE "TaskPrioritySuggestionBatch" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "requestId" UUID NOT NULL,
    "operation" VARCHAR(100) NOT NULL DEFAULT 'tasks.priority-suggestions',
    "idempotencyRecordId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "contractVersion" VARCHAR(64) NOT NULL,
    "status" "TaskPrioritySuggestionBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "inputSnapshot" JSONB NOT NULL,
    "responseSnapshot" JSONB,
    "failureCode" VARCHAR(100),
    "failureHttpStatus" INTEGER,
    "evaluatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TaskPrioritySuggestionBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskPrioritySuggestionBatch_request_hash_check" CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "TaskPrioritySuggestionBatch_contract_check" CHECK ("contractVersion" = 'tasks-prioritize-v1'),
    CONSTRAINT "TaskPrioritySuggestionBatch_terminal_check" CHECK (
      ("status" = 'PROCESSING' AND "responseSnapshot" IS NULL AND "failureCode" IS NULL AND "failureHttpStatus" IS NULL AND "evaluatedAt" IS NULL)
      OR ("status" = 'SUCCEEDED' AND "responseSnapshot" IS NOT NULL AND "failureCode" IS NULL AND "failureHttpStatus" IS NULL AND "evaluatedAt" IS NOT NULL)
      OR ("status" = 'FAILED' AND "responseSnapshot" IS NOT NULL AND "failureCode" IS NOT NULL AND "failureHttpStatus" IN (502, 503, 504) AND "evaluatedAt" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "TaskPrioritySuggestion" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "taskVersion" INTEGER NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "aiScore" DOUBLE PRECISION NOT NULL,
    "aiSuggestedPriority" "TaskPriority" NOT NULL,
    "reasons" TEXT[] NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPrioritySuggestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskPrioritySuggestion_task_version_check" CHECK ("taskVersion" >= 1),
    CONSTRAINT "TaskPrioritySuggestion_score_check" CHECK (
      "aiScore" >= 0
      AND "aiScore" <> 'Infinity'::DOUBLE PRECISION
      AND "aiScore" <> 'NaN'::DOUBLE PRECISION
    ),
    CONSTRAINT "TaskPrioritySuggestion_priority_check" CHECK ("aiSuggestedPriority" IN ('CRITICAL', 'NORMAL')),
    CONSTRAINT "TaskPrioritySuggestion_reasons_check" CHECK (cardinality("reasons") <= 5)
);

-- CreateIndex
CREATE UNIQUE INDEX "Task_datasetId_id_actorId_wardId_key" ON "Task"("datasetId", "id", "actorId", "wardId");
CREATE UNIQUE INDEX "TaskPrioritySuggestionBatch_idempotencyRecordId_key" ON "TaskPrioritySuggestionBatch"("idempotencyRecordId");
CREATE UNIQUE INDEX "TaskPrioritySuggestionBatch_datasetId_id_key" ON "TaskPrioritySuggestionBatch"("datasetId", "id");
CREATE UNIQUE INDEX "TaskPrioritySuggestionBatch_datasetId_id_actorId_wardId_key" ON "TaskPrioritySuggestionBatch"("datasetId", "id", "actorId", "wardId");
CREATE UNIQUE INDEX "TaskPrioritySuggestionBatch_datasetId_idempotencyRecordId_actorId_wardId_operation_key" ON "TaskPrioritySuggestionBatch"("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation");
CREATE INDEX "TaskPrioritySuggestionBatch_datasetId_requestId_idx" ON "TaskPrioritySuggestionBatch"("datasetId", "requestId");
CREATE INDEX "TaskPrioritySuggestionBatch_datasetId_wardId_actorId_workDate_createdAt_id_idx" ON "TaskPrioritySuggestionBatch"("datasetId", "wardId", "actorId", "workDate", "createdAt", "id");
CREATE UNIQUE INDEX "TaskPrioritySuggestion_datasetId_id_key" ON "TaskPrioritySuggestion"("datasetId", "id");
CREATE UNIQUE INDEX "TaskPrioritySuggestion_datasetId_id_taskId_key" ON "TaskPrioritySuggestion"("datasetId", "id", "taskId");
CREATE UNIQUE INDEX "TaskPrioritySuggestion_datasetId_batchId_taskId_key" ON "TaskPrioritySuggestion"("datasetId", "batchId", "taskId");
CREATE INDEX "TaskPrioritySuggestion_datasetId_taskId_createdAt_id_idx" ON "TaskPrioritySuggestion"("datasetId", "taskId", "createdAt", "id");
CREATE INDEX "TaskPrioritySuggestion_datasetId_batchId_aiScore_taskId_idx" ON "TaskPrioritySuggestion"("datasetId", "batchId", "aiScore", "taskId");
CREATE INDEX "TaskPriorityAudit_datasetId_prioritySuggestionId_idx" ON "TaskPriorityAudit"("datasetId", "prioritySuggestionId");

-- AddForeignKey
ALTER TABLE "TaskPrioritySuggestionBatch" ADD CONSTRAINT "TaskPrioritySuggestionBatch_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskPrioritySuggestionBatch" ADD CONSTRAINT "TaskPrioritySuggestionBatch_membership_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskPrioritySuggestionBatch" ADD CONSTRAINT "TaskPrioritySuggestionBatch_idempotency_scope_fkey" FOREIGN KEY ("datasetId", "idempotencyRecordId", "actorId", "wardId", "operation") REFERENCES "IdempotencyRecord"("datasetId", "id", "actorId", "wardId", "operation") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskPrioritySuggestion" ADD CONSTRAINT "TaskPrioritySuggestion_datasetId_batchId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "batchId", "actorId", "wardId") REFERENCES "TaskPrioritySuggestionBatch"("datasetId", "id", "actorId", "wardId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskPrioritySuggestion" ADD CONSTRAINT "TaskPrioritySuggestion_datasetId_taskId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "taskId", "actorId", "wardId") REFERENCES "Task"("datasetId", "id", "actorId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskPriorityAudit" ADD CONSTRAINT "TaskPriorityAudit_suggestion_task_scope_fkey" FOREIGN KEY ("datasetId", "prioritySuggestionId", "taskId") REFERENCES "TaskPrioritySuggestion"("datasetId", "id", "taskId") ON DELETE RESTRICT ON UPDATE CASCADE;
