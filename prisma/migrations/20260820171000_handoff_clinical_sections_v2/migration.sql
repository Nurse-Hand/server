ALTER TYPE "HandoffClinicalSection" ADD VALUE IF NOT EXISTS 'VITAL_SIGNS';
ALTER TYPE "HandoffClinicalSection" ADD VALUE IF NOT EXISTS 'RESPIRATION';
ALTER TYPE "HandoffClinicalSection" ADD VALUE IF NOT EXISTS 'MENTAL_STATUS';

UPDATE "HandoffDraftSection"
SET "section" = 'VITAL_SIGNS'
WHERE "section" = 'PATIENT_STATUS';

UPDATE "HandoffDraftSection"
SET "section" = 'OBSERVATION'
WHERE "section" = 'ACTIVITY';
