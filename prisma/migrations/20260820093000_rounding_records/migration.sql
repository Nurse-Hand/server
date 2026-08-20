-- CreateTable
CREATE TABLE "RoundingRecord" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "audioFileId" UUID,
    "sequence" INTEGER NOT NULL,
    "workDate" DATE NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RoundingRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RoundingRecord_sequence_check" CHECK ("sequence" >= 1),
    CONSTRAINT "RoundingRecord_time_check" CHECK ("endedAt" > "startedAt")
);

-- CreateTable
CREATE TABLE "RoundingAudioChunk" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "roundingSessionId" UUID NOT NULL,
    "audioFileId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoundingAudioChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoundingRecord_datasetId_id_key" ON "RoundingRecord"("datasetId", "id");
CREATE UNIQUE INDEX "RoundingRecord_datasetId_roundingSessionId_sequence_key" ON "RoundingRecord"("datasetId", "roundingSessionId", "sequence");
CREATE INDEX "RoundingRecord_datasetId_wardId_actorId_workDate_startedAt_id_idx" ON "RoundingRecord"("datasetId", "wardId", "actorId", "workDate", "startedAt" DESC, "id" DESC);
CREATE INDEX "RoundingRecord_datasetId_wardId_patientId_workDate_startedAt_id_idx" ON "RoundingRecord"("datasetId", "wardId", "patientId", "workDate", "startedAt" DESC, "id" DESC);
CREATE UNIQUE INDEX "RoundingAudioChunk_datasetId_id_key" ON "RoundingAudioChunk"("datasetId", "id");
CREATE UNIQUE INDEX "RoundingAudioChunk_datasetId_audioFileId_key" ON "RoundingAudioChunk"("datasetId", "audioFileId");
CREATE INDEX "RoundingAudioChunk_datasetId_wardId_actorId_roundingSessionId_createdAt_id_idx" ON "RoundingAudioChunk"("datasetId", "wardId", "actorId", "roundingSessionId", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "RoundingRecord" ADD CONSTRAINT "RoundingRecord_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundingRecord" ADD CONSTRAINT "RoundingRecord_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoundingRecord" ADD CONSTRAINT "RoundingRecord_datasetId_roundingSessionId_fkey" FOREIGN KEY ("datasetId", "roundingSessionId") REFERENCES "RoundingSession"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundingRecord" ADD CONSTRAINT "RoundingRecord_datasetId_patientId_wardId_fkey" FOREIGN KEY ("datasetId", "patientId", "wardId") REFERENCES "Patient"("datasetId", "id", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoundingRecord" ADD CONSTRAINT "RoundingRecord_datasetId_audioFileId_fkey" FOREIGN KEY ("datasetId", "audioFileId") REFERENCES "StoredFile"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoundingAudioChunk" ADD CONSTRAINT "RoundingAudioChunk_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundingAudioChunk" ADD CONSTRAINT "RoundingAudioChunk_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoundingAudioChunk" ADD CONSTRAINT "RoundingAudioChunk_datasetId_roundingSessionId_fkey" FOREIGN KEY ("datasetId", "roundingSessionId") REFERENCES "RoundingSession"("datasetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoundingAudioChunk" ADD CONSTRAINT "RoundingAudioChunk_datasetId_audioFileId_fkey" FOREIGN KEY ("datasetId", "audioFileId") REFERENCES "StoredFile"("datasetId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
