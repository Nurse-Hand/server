#!/usr/bin/env bash
set -Eeuo pipefail

: "${NURSE_HAND_SERVER_IMAGE:?NURSE_HAND_SERVER_IMAGE is required}"
: "${DEPLOY_SHA:?DEPLOY_SHA is required}"
: "${DEPLOY_RUN_ID:?DEPLOY_RUN_ID is required}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"
: "${EXTERNAL_BASE_URL:?EXTERNAL_BASE_URL is required}"

API_CONTAINER_NAME="${NURSE_HAND_API_CONTAINER_NAME:-nurse-hand-server}"
WORKER_CONTAINER_NAME="${NURSE_HAND_WORKER_CONTAINER_NAME:-nurse-hand-worker}"
HEALTHCHECK_ATTEMPTS="${DEPLOY_HEALTHCHECK_ATTEMPTS:-30}"
HEALTHCHECK_INTERVAL_SECONDS="${DEPLOY_HEALTHCHECK_INTERVAL_SECONDS:-2}"
BUNDLE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${BUNDLE_DIR}/docker-compose.prod.yml"
STORAGE_SMOKE_SCRIPT="${BUNDLE_DIR}/deploy/storage-permission-smoke.mjs"
ENV_FILE="${DEPLOY_ROOT}/.env"
STATE_DIR="${DEPLOY_ROOT}/deploy-state"
LOCK_FILE="${DEPLOY_ROOT}/deploy.lock"
DEPLOYMENT_STATE_FILE="${STATE_DIR}/current"
EXTERNAL_HEALTH_URL="${EXTERNAL_BASE_URL%/}/api/v1/health"
FUNCTIONAL_SMOKE_URL="${EXTERNAL_BASE_URL%/}/api/v1/patients"

fail() {
  echo "Deployment failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

validate_inputs() {
  if [[ "$(id -u)" == "0" ]]; then
    fail "the deployment script must run as a non-root account"
  fi
  if [[ ! "${DEPLOY_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
    fail "DEPLOY_SHA must be a full lowercase Git commit SHA"
  fi
  if [[ ! "${DEPLOY_RUN_ID}" =~ ^[1-9][0-9]*$ ]]; then
    fail "DEPLOY_RUN_ID must be a positive integer"
  fi
  if [[ ! "${NURSE_HAND_SERVER_IMAGE}" =~ ^[A-Za-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]]; then
    fail "NURSE_HAND_SERVER_IMAGE must use an immutable registry digest"
  fi
  if [[ "${DEPLOY_ROOT}" == "/" || "${DEPLOY_ROOT}" == *".."* || ! "${DEPLOY_ROOT}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
    fail "DEPLOY_ROOT must be a narrow absolute path"
  fi
  if [[ ! "${EXTERNAL_BASE_URL}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
    fail "EXTERNAL_BASE_URL must be an HTTPS origin without a path"
  fi
  if [[ ! "${HEALTHCHECK_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]]; then
    fail "DEPLOY_HEALTHCHECK_ATTEMPTS must be a positive integer"
  fi
  if ((HEALTHCHECK_ATTEMPTS > 120)); then
    fail "DEPLOY_HEALTHCHECK_ATTEMPTS must not exceed 120"
  fi
  if [[ ! "${HEALTHCHECK_INTERVAL_SECONDS}" =~ ^[0-9]+$ ]]; then
    fail "DEPLOY_HEALTHCHECK_INTERVAL_SECONDS must be a non-negative integer"
  fi
  if ((HEALTHCHECK_INTERVAL_SECONDS > 10)); then
    fail "DEPLOY_HEALTHCHECK_INTERVAL_SECONDS must not exceed 10"
  fi
  if [[ ! -f "${COMPOSE_FILE}" ]]; then
    fail "deployment bundle is missing docker-compose.prod.yml"
  fi
  if [[ ! -f "${STORAGE_SMOKE_SCRIPT}" ]]; then
    fail "deployment bundle is missing storage-permission-smoke.mjs"
  fi
  if [[ ! -f "${ENV_FILE}" ]]; then
    fail "deployment environment file is missing: ${ENV_FILE}"
  fi
  if [[ ! -d "${STATE_DIR}" || ! -w "${STATE_DIR}" ]]; then
    fail "pre-provisioned deploy-state directory is required and must be writable"
  fi
  if [[ ! -w "${DEPLOY_ROOT}" ]]; then
    fail "DEPLOY_ROOT must be writable by the deployment account"
  fi
}

compose() {
  local image="$1"
  shift
  NURSE_HAND_ENV_FILE="${ENV_FILE}" \
    NURSE_HAND_SERVER_IMAGE="${image}" \
    docker compose \
      --project-name nurse-hand \
      --env-file "${ENV_FILE}" \
      -f "${COMPOSE_FILE}" \
      "$@"
}

read_deployment_state() {
  STORED_RUN_ID=''
  STORED_SHA=''
  STORED_CURRENT_IMAGE=''
  STORED_PREVIOUS_IMAGE=''

  if [[ ! -f "${DEPLOYMENT_STATE_FILE}" ]]; then
    return
  fi

  IFS='|' read -r \
    STORED_RUN_ID \
    STORED_SHA \
    STORED_CURRENT_IMAGE \
    STORED_PREVIOUS_IMAGE < "${DEPLOYMENT_STATE_FILE}"

  if [[ ! "${STORED_RUN_ID}" =~ ^[1-9][0-9]*$ \
    || ! "${STORED_SHA}" =~ ^[0-9a-f]{40}$ \
    || ! "${STORED_CURRENT_IMAGE}" =~ ^[A-Za-z0-9._/:@-]+$ \
    || ! "${STORED_PREVIOUS_IMAGE}" =~ ^[A-Za-z0-9._/:@-]+$ ]]; then
    fail "stored deployment state is invalid"
  fi
}

write_deployment_state() {
  local current_image="$1"
  local previous_image="$2"
  local temporary_path="${DEPLOYMENT_STATE_FILE}.tmp-${DEPLOY_RUN_ID}"

  printf '%s|%s|%s|%s\n' \
    "${DEPLOY_RUN_ID}" \
    "${DEPLOY_SHA}" \
    "${current_image}" \
    "${previous_image}" > "${temporary_path}"
  mv -f -- "${temporary_path}" "${DEPLOYMENT_STATE_FILE}"
}

wait_for_container_readiness() {
  local container_name="$1"
  local required_successes="${2:-1}"
  local attempt status consecutive_successes=0
  for ((attempt = 1; attempt <= HEALTHCHECK_ATTEMPTS; attempt += 1)); do
    status="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "${container_name}" 2>/dev/null || true
    )"

    if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
      consecutive_successes=$((consecutive_successes + 1))
      if ((consecutive_successes >= required_successes)); then
        return 0
      fi
      sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
      continue
    fi
    if [[ "${status}" == "unhealthy" || "${status}" == "exited" || "${status}" == "dead" ]]; then
      return 1
    fi

    sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
  done

  return 1
}

check_external_readiness() {
  curl \
    --fail \
    --silent \
    --show-error \
    --max-time 5 \
    --output /dev/null \
    "${EXTERNAL_HEALTH_URL}" \
    && curl \
      --fail \
      --silent \
      --show-error \
      --max-time 10 \
      --output /dev/null \
      "${FUNCTIONAL_SMOKE_URL}"
}

check_storage_permissions() {
  compose "${NURSE_HAND_SERVER_IMAGE}" exec -T api \
    node --input-type=module - < "${STORAGE_SMOKE_SCRIPT}"
}

rollback() {
  local rollback_image="$1"
  local reason="$2"

  echo "Deployment readiness failed (${reason}); restoring the previous image." >&2
  if ! compose "${rollback_image}" up -d --no-deps api worker; then
    fail "rollback API and worker replacement failed"
  fi
  if ! wait_for_container_readiness "${API_CONTAINER_NAME}"; then
    fail "rollback API container did not become healthy"
  fi
  if ! wait_for_container_readiness "${WORKER_CONTAINER_NAME}" 2; then
    fail "rollback worker container did not become ready"
  fi
  if ! check_external_readiness; then
    fail "rollback external readiness failed"
  fi

  fail "new image was rolled back after ${reason}"
}

for required_command in curl docker flock id mv sleep; do
  require_command "${required_command}"
done
validate_inputs

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  fail "another deployment holds the server lock"
fi

read_deployment_state
if [[ -n "${STORED_RUN_ID}" ]]; then
  if ((DEPLOY_RUN_ID <= STORED_RUN_ID)); then
    fail "deployment run is not newer than the last successful run"
  fi
fi

previous_image_id="$(
  docker inspect --format '{{.Image}}' "${API_CONTAINER_NAME}" 2>/dev/null || true
)"
previous_image_reference="$(
  docker inspect --format '{{.Config.Image}}' "${API_CONTAINER_NAME}" 2>/dev/null || true
)"
previous_worker_image_id="$(
  docker inspect --format '{{.Image}}' "${WORKER_CONTAINER_NAME}" 2>/dev/null || true
)"
previous_worker_image_reference="$(
  docker inspect --format '{{.Config.Image}}' "${WORKER_CONTAINER_NAME}" 2>/dev/null || true
)"
if [[ -z "${previous_image_id}" || -z "${previous_image_reference}" \
  || -z "${previous_worker_image_id}" || -z "${previous_worker_image_reference}" ]]; then
  fail "existing API and worker containers are required for safe deployment"
fi
if [[ ! "${previous_image_id}" =~ ^sha256:[0-9a-f]{64}$ \
  || ! "${previous_worker_image_id}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  fail "an existing server container image ID is invalid"
fi
if [[ ! "${previous_image_reference}" =~ ^[A-Za-z0-9._/:@-]+$ \
  || ! "${previous_worker_image_reference}" =~ ^[A-Za-z0-9._/:@-]+$ ]]; then
  fail "an existing server container image reference is invalid"
fi
if [[ "${previous_image_id}" != "${previous_worker_image_id}" \
  || "${previous_image_reference}" != "${previous_worker_image_reference}" ]]; then
  fail "existing API and worker images must match before deployment"
fi
if ! wait_for_container_readiness "${API_CONTAINER_NAME}"; then
  fail "the existing API container is not healthy before deployment"
fi
if ! wait_for_container_readiness "${WORKER_CONTAINER_NAME}" 2; then
  fail "the existing worker container is not ready before deployment"
fi
if ! check_external_readiness; then
  fail "the existing API external readiness failed before deployment"
fi

rollback_image="nurse-hand-server-local:rollback-${DEPLOY_RUN_ID}"
docker image tag "${previous_image_id}" "${rollback_image}"

# Pull and migrate while the current API and worker containers remain online.
docker pull "${NURSE_HAND_SERVER_IMAGE}"
compose "${NURSE_HAND_SERVER_IMAGE}" run \
  --rm \
  --no-deps \
  --entrypoint npx \
  api \
  prisma migrate deploy

if ! compose "${NURSE_HAND_SERVER_IMAGE}" up -d --no-deps api worker; then
  rollback "${rollback_image}" "API and worker replacement"
fi
if ! wait_for_container_readiness "${API_CONTAINER_NAME}"; then
  rollback "${rollback_image}" "API container readiness"
fi
if ! wait_for_container_readiness "${WORKER_CONTAINER_NAME}" 2; then
  rollback "${rollback_image}" "worker container readiness"
fi
if ! check_storage_permissions; then
  rollback "${rollback_image}" "storage permission smoke"
fi
if ! check_external_readiness; then
  rollback "${rollback_image}" "external readiness"
fi

previous_recorded_image="${STORED_CURRENT_IMAGE}"
if [[ -z "${previous_recorded_image}" ]]; then
  previous_recorded_image="${previous_image_reference}"
fi
write_deployment_state "${NURSE_HAND_SERVER_IMAGE}" "${previous_recorded_image}"

echo "Deployment completed for ${DEPLOY_SHA}."
