-- CreateEnum
CREATE TYPE "StoredFileKind" AS ENUM ('AUDIO', 'PHOTO');

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "storageUri" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "kind" "StoredFileKind" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoredFile_size_bytes_check" CHECK ("sizeBytes" > 0),
    CONSTRAINT "StoredFile_checksum_check" CHECK ("checksum" ~ '^[0-9a-f]{64}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_datasetId_id_key" ON "StoredFile"("datasetId", "id");
CREATE UNIQUE INDEX "StoredFile_storageUri_key" ON "StoredFile"("storageUri");
CREATE INDEX "StoredFile_datasetId_wardId_kind_createdAt_id_idx" ON "StoredFile"("datasetId", "wardId", "kind", "createdAt" DESC, "id" DESC);
CREATE INDEX "StoredFile_kind_createdAt_id_idx" ON "StoredFile"("kind", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_datasetId_actorId_wardId_fkey" FOREIGN KEY ("datasetId", "actorId", "wardId") REFERENCES "WardMembership"("datasetId", "nurseId", "wardId") ON DELETE RESTRICT ON UPDATE CASCADE;
