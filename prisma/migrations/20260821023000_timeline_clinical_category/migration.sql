CREATE TYPE "TimelineClinicalCategory" AS ENUM (
    'VITAL_SIGNS',
    'RESPIRATION',
    'MENTAL_STATUS',
    'PAIN',
    'TREATMENT',
    'DIET',
    'OBSERVATION'
);

ALTER TABLE "TimelineEvent"
ADD COLUMN "clinicalCategory" "TimelineClinicalCategory";

-- 기존 Quick Note와 TimelineEvent를 추측으로 연결하지 않는다.
-- dataset/ward/patient scope와 두 독립 식별자(logicalKey, sourceReference)가
-- 모두 같은 QuickNote UUID를 가리키는 MANUAL OBSERVATION만 안전하게 보강한다.
UPDATE "TimelineEvent" AS timeline
SET "clinicalCategory" =
    quick_note."noteType"::text::"TimelineClinicalCategory"
FROM "QuickNote" AS quick_note
WHERE timeline."datasetId" = quick_note."datasetId"
  AND timeline."wardId" = quick_note."wardId"
  AND timeline."patientId" = quick_note."patientId"
  AND timeline."logicalKey" = 'quick-note:' || quick_note."id"::text
  AND timeline."sourceReference" = 'quick-note:' || quick_note."id"::text
  AND timeline."type" = 'OBSERVATION'
  AND timeline."source" = 'MANUAL'
  AND timeline."clinicalCategory" IS NULL;
