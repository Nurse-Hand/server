-- CreateEnum
CREATE TYPE "TaskScopeType" AS ENUM ('PATIENT', 'WARD');

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN "scopeType" "TaskScopeType" NOT NULL DEFAULT 'PATIENT',
  ADD COLUMN "locationLabel" VARCHAR(100),
  ADD COLUMN "isCarryOver" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dependencyTaskIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "priorityMeta" JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Existing null-patient manual tasks represent ward operation tasks in the MVP contract.
UPDATE "Task"
SET "scopeType" = 'WARD'
WHERE "patientId" IS NULL;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_scope_patient_check" CHECK (
    ("scopeType" = 'PATIENT' AND "patientId" IS NOT NULL)
    OR ("scopeType" = 'WARD' AND "patientId" IS NULL)
  ),
  ADD CONSTRAINT "Task_priority_meta_object_check" CHECK (jsonb_typeof("priorityMeta") = 'object');

ALTER TABLE "TaskPrioritySuggestion"
  DROP CONSTRAINT "TaskPrioritySuggestion_priority_check";

ALTER TABLE "TaskPrioritySuggestion"
  ADD CONSTRAINT "TaskPrioritySuggestion_priority_check" CHECK ("aiSuggestedPriority" IN ('CRITICAL', 'HIGH', 'NORMAL'));
