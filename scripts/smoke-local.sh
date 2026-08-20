#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-.env.local}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

SERVER_IMAGE="${SERVER_IMAGE:-nurse-hand-server:dev}"
SERVER_PLATFORM="${SERVER_PLATFORM:-${NURSE_HAND_SERVER_PLATFORM:-linux/amd64}}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${APP_PORT:-3000}}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

json_tmp() {
  mktemp "${TMP_DIR}/response.XXXXXX"
}

request_json() {
  local method="$1"
  local url="$2"
  local body_file="$3"
  shift 3

  local response_file
  response_file="$(json_tmp)"
  local http_code
  http_code="$(
    curl -sS -o "${response_file}" -w '%{http_code}' -X "${method}" "${url}" "$@"
  )"

  echo
  echo "== ${method} ${url} (${http_code}) =="
  jq . "${response_file}"

  if [[ ! "${http_code}" =~ ^2[0-9][0-9]$ ]]; then
    echo "request failed: ${method} ${url} -> ${http_code}" >&2
    exit 1
  fi

  cp "${response_file}" "${body_file}"
}

echo "== build local api image (${SERVER_IMAGE}, ${SERVER_PLATFORM}) =="
docker buildx build \
  --platform "${SERVER_PLATFORM}" \
  -t "${SERVER_IMAGE}" \
  --load \
  .

echo
echo "== docker compose up =="
NURSE_HAND_SERVER_IMAGE="${SERVER_IMAGE}" \
NURSE_HAND_SERVER_PLATFORM="${SERVER_PLATFORM}" \
docker compose --env-file "${ENV_FILE}" -f docker-compose.local.yml up -d --remove-orphans

echo
echo "== containers =="
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

HEALTH_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/health" "${HEALTH_JSON}"

PATIENTS_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/patients" "${PATIENTS_JSON}"
PATIENT_1_ID="$(jq -r '.data.items[0].patientId' "${PATIENTS_JSON}")"
PATIENT_2_ID="$(jq -r '.data.items[1].patientId // .data.items[0].patientId' "${PATIENTS_JSON}")"

PATIENT_DETAIL_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/patients/${PATIENT_1_ID}" "${PATIENT_DETAIL_JSON}"

PATIENT_TIMELINE_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/patients/${PATIENT_1_ID}/timeline" "${PATIENT_TIMELINE_JSON}"

WAV_FILE="${TMP_DIR}/smoke-upload.wav"
node - "${WAV_FILE}" <<'NODE'
const fs = require('fs');
const output = process.argv[2];
const sampleRate = 16000;
const seconds = 1;
const numChannels = 1;
const bitsPerSample = 16;
const byteRate = sampleRate * numChannels * bitsPerSample / 8;
const blockAlign = numChannels * bitsPerSample / 8;
const samples = sampleRate * seconds;
const dataSize = samples * blockAlign;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(numChannels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(byteRate, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(bitsPerSample, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);
fs.writeFileSync(output, buffer);
NODE

UPLOAD_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/files/audio" "${UPLOAD_JSON}" \
  -H "X-Request-Id: $(uuidgen)" \
  -F "file=@${WAV_FILE};type=audio/wav"
AUDIO_FILE_ID="$(jq -r '.data.id' "${UPLOAD_JSON}")"

TASK_DUE_AT="$(
  node -e "console.log(new Date(Date.now() + 60 * 60 * 1000).toISOString())"
)"
TASK_CREATE_PAYLOAD="${TMP_DIR}/task-create.json"
cat > "${TASK_CREATE_PAYLOAD}" <<EOF
{
  "patientId": "${PATIENT_1_ID}",
  "title": "로컬 스모크 테스트 업무",
  "description": "docker-compose.local.yml 기준 smoke 검증",
  "dueAt": "${TASK_DUE_AT}",
  "priorityOverride": "HIGH"
}
EOF
TASK_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/tasks" "${TASK_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: smoke-task-$(uuidgen)" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${TASK_CREATE_PAYLOAD}"
TASK_ID="$(jq -r '.data.taskId' "${TASK_JSON}")"
TASK_VERSION="$(jq -r '.data.version' "${TASK_JSON}")"

TASK_PATCH_PAYLOAD="${TMP_DIR}/task-patch.json"
cat > "${TASK_PATCH_PAYLOAD}" <<EOF
{
  "status": "IN_PROGRESS",
  "version": ${TASK_VERSION}
}
EOF
TASK_PATCH_JSON="$(json_tmp)"
request_json PATCH "${BASE_URL}/api/v1/tasks/${TASK_ID}" "${TASK_PATCH_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${TASK_PATCH_PAYLOAD}"

TASK_LIST_JSON="$(json_tmp)"
TASK_WORK_DATE="$(
  node -e "const dueAt = new Date(process.argv[1]); console.log(dueAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));" "${TASK_DUE_AT}"
)"
request_json GET "${BASE_URL}/api/v1/tasks?date=${TASK_WORK_DATE}" "${TASK_LIST_JSON}"

ROUNDING_TIMES_JSON="${TMP_DIR}/rounding-times.json"
node > "${ROUNDING_TIMES_JSON}" <<'NODE'
const base = Date.now() - 10 * 60 * 1000;
const iso = (offsetMinutes) => new Date(base + offsetMinutes * 60 * 1000).toISOString();
console.log(JSON.stringify({
  sessionStartedAt: iso(0),
  segment1StartedAt: iso(1),
  segment1EndedAt: iso(3),
  segment2StartedAt: iso(4),
  segment2EndedAt: iso(6),
  completedAt: iso(8),
}));
NODE

ROUNDING_START_PAYLOAD="${TMP_DIR}/rounding-start.json"
cat > "${ROUNDING_START_PAYLOAD}" <<EOF
{
  "startedAt": "$(jq -r '.sessionStartedAt' "${ROUNDING_TIMES_JSON}")",
  "note": "local smoke test"
}
EOF
ROUNDING_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/rounding-sessions" "${ROUNDING_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${ROUNDING_START_PAYLOAD}"
ROUNDING_SESSION_ID="$(jq -r '.data.id' "${ROUNDING_JSON}")"

SEGMENT_1_PAYLOAD="${TMP_DIR}/segment-1.json"
cat > "${SEGMENT_1_PAYLOAD}" <<EOF
{
  "patientId": "${PATIENT_1_ID}",
  "startedAt": "$(jq -r '.segment1StartedAt' "${ROUNDING_TIMES_JSON}")",
  "endedAt": "$(jq -r '.segment1EndedAt' "${ROUNDING_TIMES_JSON}")",
  "note": "기침이 잦고 호흡이 조금 답답합니다. 산소포화도 확인이 필요합니다."
}
EOF
ROUNDING_SEGMENT_1_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}/patient-segments" "${ROUNDING_SEGMENT_1_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${SEGMENT_1_PAYLOAD}"

SEGMENT_2_PAYLOAD="${TMP_DIR}/segment-2.json"
cat > "${SEGMENT_2_PAYLOAD}" <<EOF
{
  "patientId": "${PATIENT_2_ID}",
  "startedAt": "$(jq -r '.segment2StartedAt' "${ROUNDING_TIMES_JSON}")",
  "endedAt": "$(jq -r '.segment2EndedAt' "${ROUNDING_TIMES_JSON}")",
  "note": "식사 섭취량이 적고 통증은 NRS 5점 정도라고 말했습니다."
}
EOF
ROUNDING_SEGMENT_2_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}/patient-segments" "${ROUNDING_SEGMENT_2_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${SEGMENT_2_PAYLOAD}"

ROUNDING_READ_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}" "${ROUNDING_READ_JSON}"

ROUNDING_COMPLETE_PAYLOAD="${TMP_DIR}/rounding-complete.json"
cat > "${ROUNDING_COMPLETE_PAYLOAD}" <<EOF
{
  "completedAt": "$(jq -r '.completedAt' "${ROUNDING_TIMES_JSON}")"
}
EOF
ROUNDING_COMPLETE_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}/complete" "${ROUNDING_COMPLETE_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${ROUNDING_COMPLETE_PAYLOAD}"

ROUNDING_ANALYSIS_START_PAYLOAD="${TMP_DIR}/rounding-analysis-start.json"
cat > "${ROUNDING_ANALYSIS_START_PAYLOAD}" <<EOF
{
  "audioFileId": "${AUDIO_FILE_ID}"
}
EOF
ROUNDING_ANALYSIS_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}/analysis-jobs" "${ROUNDING_ANALYSIS_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${ROUNDING_ANALYSIS_START_PAYLOAD}"
ROUNDING_JOB_ID="$(jq -r '.data.jobId' "${ROUNDING_ANALYSIS_JSON}")"

ROUNDING_ANALYSIS_READ_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/rounding-analysis-jobs/${ROUNDING_JOB_ID}" "${ROUNDING_ANALYSIS_READ_JSON}"

ROUNDING_CONFIRM_PAYLOAD="${TMP_DIR}/rounding-confirm.json"
jq -c '{
  jobId: .data.jobId,
  utterances: [
    .data.utterances[]
    | {
        utteranceId,
        patientId,
        speakerRole,
        important: (.speakerRole == "PATIENT_CANDIDATE")
      }
  ]
}' "${ROUNDING_ANALYSIS_READ_JSON}" > "${ROUNDING_CONFIRM_PAYLOAD}"

ROUNDING_CONFIRM_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/rounding-sessions/${ROUNDING_SESSION_ID}/analysis-confirmation" "${ROUNDING_CONFIRM_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${ROUNDING_CONFIRM_PAYLOAD}"

EVIDENCE_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/evidence?patientId=${PATIENT_1_ID}" "${EVIDENCE_JSON}"

PATIENT_TIMELINE_AFTER_JSON="$(json_tmp)"
request_json GET "${BASE_URL}/api/v1/patients/${PATIENT_1_ID}/timeline" "${PATIENT_TIMELINE_AFTER_JSON}"

SENDER_SHIFT_JSON="${TMP_DIR}/sender-shift.json"
docker exec nurse-hand-db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A -F $'\t' -c \
  'select id, duty from "NurseShift" order by "startsAt" asc limit 1;' \
  | awk -F '\t' 'NF >= 2 { print "{\"shiftId\":\"" $1 "\",\"senderDuty\":\"" $2 "\"}" }' \
  > "${SENDER_SHIFT_JSON}"
SENDER_SHIFT_ID="$(jq -r '.shiftId' "${SENDER_SHIFT_JSON}")"

RECEIVER_SHIFT_JSON="${TMP_DIR}/receiver-shift.json"
docker exec nurse-hand-db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A -F $'\t' -c \
  "select duty, to_char((\"startsAt\" at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') from \"NurseShift\" where id <> '${SENDER_SHIFT_ID}' order by \"startsAt\" asc limit 1;" \
  | awk -F '\t' 'NF >= 2 { print "{\"targetDuty\":\"" $1 "\",\"date\":\"" $2 "\"}" }' \
  > "${RECEIVER_SHIFT_JSON}"
TARGET_DUTY="$(jq -r '.targetDuty' "${RECEIVER_SHIFT_JSON}")"
PRECHECK_DATE="$(jq -r '.date' "${RECEIVER_SHIFT_JSON}")"

PRECHECK_PAYLOAD="${TMP_DIR}/handoff-precheck.json"
cat > "${PRECHECK_PAYLOAD}" <<EOF
{
  "shiftId": "${SENDER_SHIFT_ID}",
  "targetDuty": "${TARGET_DUTY}",
  "date": "${PRECHECK_DATE}"
}
EOF
PRECHECK_JSON="$(json_tmp)"
request_json POST "${BASE_URL}/api/v1/handoff-prechecks" "${PRECHECK_JSON}" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: smoke-precheck-$(uuidgen)" \
  -H "X-Request-Id: $(uuidgen)" \
  --data @"${PRECHECK_PAYLOAD}"

echo
echo "== recent api logs =="
docker logs --tail 80 nurse-hand-server || true

echo
echo "== recent worker logs =="
docker logs --tail 80 nurse-hand-worker || true

echo
echo "== recent ai logs =="
docker logs --tail 80 nurse-hand-ai || true

echo
echo "smoke test passed"
