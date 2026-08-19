-- CreateEnum
CREATE TYPE "RoundingSessionStatus" AS ENUM ('RECORDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "RoundingSession" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "status" "RoundingSessionStatus" NOT NULL DEFAULT 'RECORDING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "note" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RoundingSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoundingSession_version_check" CHECK ("version" >= 1),
    CONSTRAINT "RoundingSession_state_check" CHECK (
      (
        "status" = 'RECORDING'
        AND "completedAt" IS NULL
      ) OR (
        "status" = 'COMPLETED'
        AND "completedAt" IS NOT NULL
        AND "completedAt" >= "startedAt"
      )
    )
);

CREATE TABLE "RoundingPatientSegment" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoundingPatientSegment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoundingPatientSegment_sequence_check" CHECK ("sequence" >= 1),
    CONSTRAINT "RoundingPatientSegment_time_check" CHECK ("endedAt" > "startedAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoundingSession_datasetId_id_key" ON "RoundingSession"("datasetId", "id");
CREATE INDEX "RoundingSession_datasetId_wardId_actorId_status_startedAt_id_idx" ON "RoundingSession"("datasetId", "wardId", "actorId", "status", "startedAt" DESC, "id");
CREATE UNIQUE INDEX "RoundingPatientSegment_datasetId_id_key" ON "RoundingPatientSegment"("datasetId", "id");
CREATE UNIQUE INDEX "RoundingPatientSegment_datasetId_roundingSessionId_sequence_key" ON "RoundingPatientSegment"("datasetId", "roundingSessionId", "sequence");
CREATE INDEX "RoundingPatientSegment_datasetId_wardId_patientId_startedAt_id_idx" ON "RoundingPatientSegment"("datasetId", "wardId", "patientId", "startedAt", "id");

-- AddForeignKey
ALTER TABLE "RoundingSession" ADD CONSTRAINT "RoundingSession_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundingSession" ADD CONSTRAINT "RoundingSession_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoundingPatientSegment" ADD CONSTRAINT "RoundingPatientSegment_datasetId_roundingSessionId_fkey" FOREIGN KEY ("datasetId", "roundingSessionId") REFERENCES "RoundingSession"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundingPatientSegment" ADD CONSTRAINT "RoundingPatientSegment_datasetId_patientId_wardId_fkey" FOREIGN KEY ("datasetId", "patientId", "wardId") REFERENCES "Patient"("datasetId", "id", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
