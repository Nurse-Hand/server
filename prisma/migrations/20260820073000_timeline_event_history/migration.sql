-- CreateEnum
CREATE TYPE "TimelineEventConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- AlterTable
ALTER TABLE "TimelineEvent"
ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "confirmationStatus" "TimelineEventConfirmationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "updatedByActorId" UUID;

-- CreateTable
CREATE TABLE "TimelineEventHistory" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "timelineEventId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "editedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL,
    "previousSummary" VARCHAR(500) NOT NULL,
    "nextSummary" VARCHAR(500) NOT NULL,
    "previousImportant" BOOLEAN NOT NULL,
    "nextImportant" BOOLEAN NOT NULL,
    "previousConfirmationStatus" "TimelineEventConfirmationStatus" NOT NULL,
    "nextConfirmationStatus" "TimelineEventConfirmationStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEventHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TimelineEventHistory_version_check" CHECK ("version" >= 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "TimelineEventHistory_datasetId_id_key" ON "TimelineEventHistory"("datasetId", "id");
CREATE INDEX "TimelineEventHistory_datasetId_timelineEventId_editedAt_id_idx" ON "TimelineEventHistory"("datasetId", "timelineEventId", "editedAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "TimelineEventHistory" ADD CONSTRAINT "TimelineEventHistory_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "DemoDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineEventHistory" ADD CONSTRAINT "TimelineEventHistory_timelineEventId_fkey" FOREIGN KEY ("timelineEventId") REFERENCES "TimelineEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
