ALTER TABLE "Patient"
  ADD COLUMN "patientCode" VARCHAR(32),
  ADD COLUMN "statusLabel" VARCHAR(20),
  ADD COLUMN "department" VARCHAR(50),
  ADD COLUMN "admittedAt" TIMESTAMPTZ(3),
  ADD COLUMN "baselineSummary" VARCHAR(500);
