CREATE TYPE "QuickNoteType" AS ENUM (
    'VITAL_SIGNS',
    'RESPIRATION',
    'MENTAL_STATUS',
    'PAIN',
    'TREATMENT',
    'DIET',
    'OBSERVATION'
);

CREATE TYPE "QuickNoteSourceType" AS ENUM ('QUICK_NOTE');

CREATE TYPE "QuickNoteEvidenceStatus" AS ENUM ('PENDING', 'CONVERTED');

CREATE TABLE "QuickNote" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "logicalKey" VARCHAR(64) NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "noteType" "QuickNoteType" NOT NULL,
    "topic" "QuickNoteType" NOT NULL,
    "handoffSection" VARCHAR(50) NOT NULL,
    "sourceType" "QuickNoteSourceType" NOT NULL DEFAULT 'QUICK_NOTE',
    "text" VARCHAR(2000),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "audioFileId" UUID,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "structuredFacts" JSONB NOT NULL,
    "evidenceStatus" "QuickNoteEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuickNotePhoto" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "quickNoteId" UUID NOT NULL,
    "photoFileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickNotePhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickNote_datasetId_id_key" ON "QuickNote"("datasetId", "id");
CREATE UNIQUE INDEX "QuickNote_datasetId_logicalKey_key" ON "QuickNote"("datasetId", "logicalKey");
CREATE INDEX "QuickNote_datasetId_wardId_patientId_occurredAt_id_idx" ON "QuickNote"("datasetId", "wardId", "patientId", "occurredAt" DESC, "id" DESC);
CREATE UNIQUE INDEX "QuickNotePhoto_datasetId_quickNoteId_photoFileId_key" ON "QuickNotePhoto"("datasetId", "quickNoteId", "photoFileId");
CREATE INDEX "QuickNotePhoto_datasetId_quickNoteId_createdAt_id_idx" ON "QuickNotePhoto"("datasetId", "quickNoteId", "createdAt", "id");

ALTER TABLE "QuickNote"
  ADD CONSTRAINT "QuickNote_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuickNote"
  ADD CONSTRAINT "QuickNote_datasetId_patientId_wardId_fkey"
  FOREIGN KEY ("datasetId", "patientId", "wardId") REFERENCES "Patient"("datasetId", "id", "wardId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuickNote"
  ADD CONSTRAINT "QuickNote_datasetId_audioFileId_fkey"
  FOREIGN KEY ("datasetId", "audioFileId") REFERENCES "StoredFile"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuickNotePhoto"
  ADD CONSTRAINT "QuickNotePhoto_datasetId_quickNoteId_fkey"
  FOREIGN KEY ("datasetId", "quickNoteId") REFERENCES "QuickNote"("datasetId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuickNotePhoto"
  ADD CONSTRAINT "QuickNotePhoto_datasetId_photoFileId_fkey"
  FOREIGN KEY ("datasetId", "photoFileId") REFERENCES "StoredFile"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
