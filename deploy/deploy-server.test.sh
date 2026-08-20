#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy-server.sh"
TEST_TMP_ROOT="$(mktemp -d)"
DEPLOY_SHA="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
OLD_SHA="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
NEW_IMAGE="example.invalid/nurse-hand-server@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
OLD_IMAGE="example.invalid/nurse-hand-server:${OLD_SHA}"

cleanup() {
  rm -rf -- "${TEST_TMP_ROOT}"
}
trap cleanup EXIT

fail_test() {
  echo "deploy test failed: $*" >&2
  exit 1
}

assert_contains() {
  local path="$1"
  local expected="$2"
  grep -F -- "${expected}" "${path}" >/dev/null \
    || fail_test "${path} does not contain: ${expected}"
}

assert_not_contains() {
  local path="$1"
  local unexpected="$2"
  if grep -F -- "${unexpected}" "${path}" >/dev/null; then
    fail_test "${path} unexpectedly contains: ${unexpected}"
  fi
}

create_scenario() {
  local name="$1"
  local root="${TEST_TMP_ROOT}/${name}"

  mkdir -p "${root}/bin" "${root}/deploy-root/deploy-state"
  printf 'synthetic=true\n' > "${root}/deploy-root/.env"
  printf '%s\n' "${OLD_IMAGE}" > "${root}/active-image"
  : > "${root}/commands.log"

  cat > "${root}/bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
echo "docker $*" >> "${FAKE_COMMAND_LOG}"

if [[ "$1" == "inspect" ]]; then
  case "$3" in
    '{{.Image}}')
      echo 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      ;;
    '{{.Config.Image}}')
      cat "${FAKE_ACTIVE_IMAGE_FILE}"
      ;;
    *)
      active_image="$(cat "${FAKE_ACTIVE_IMAGE_FILE}")"
      active_phase='baseline'
      if [[ "${active_image}" == "${NURSE_HAND_SERVER_IMAGE}" ]]; then
        active_phase='replacement'
      elif [[ "${active_image}" == nurse-hand-server-local:rollback-* ]]; then
        active_phase='rollback'
      fi
      if [[ "${FAKE_SCENARIO}" == "baseline-container-health-fail" && "${active_phase}" == 'baseline' ]]; then
        echo 'unhealthy'
      elif [[ "${FAKE_SCENARIO}" == "container-health-fail" && "${active_phase}" == 'replacement' ]]; then
        echo 'unhealthy'
      else
        echo 'healthy'
      fi
      ;;
  esac
  exit 0
fi

if [[ "$1" == "image" && "$2" == "tag" ]]; then
  exit 0
fi

if [[ "$1" == "pull" ]]; then
  [[ "${FAKE_SCENARIO}" != "pull-fail" ]]
  exit
fi

if [[ "$1" != "compose" ]]; then
  echo "unsupported fake docker command: $*" >&2
  exit 90
fi

shift
while (($# > 0)); do
  case "$1" in
    run|up|exec)
      action="$1"
      shift
      break
      ;;
    --project-name|--env-file|-f)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

case "${action:-}" in
  run)
    [[ "${FAKE_SCENARIO}" != "migration-fail" ]]
    ;;
  up)
    printf '%s\n' "${NURSE_HAND_SERVER_IMAGE}" > "${FAKE_ACTIVE_IMAGE_FILE}"
    ;;
  exec)
    cat >/dev/null
    active_image="$(cat "${FAKE_ACTIVE_IMAGE_FILE}")"
    if [[ "${FAKE_SCENARIO}" == "storage-fail" && "${active_image}" == "${NURSE_HAND_SERVER_IMAGE}" ]]; then
      exit 1
    fi
    ;;
  *)
    exit 91
    ;;
esac
FAKE_DOCKER

  cat > "${root}/bin/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
echo "curl $*" >> "${FAKE_COMMAND_LOG}"
active_image="$(cat "${FAKE_ACTIVE_IMAGE_FILE}")"
active_phase='baseline'
if [[ "${active_image}" == "${NURSE_HAND_SERVER_IMAGE}" ]]; then
  active_phase='replacement'
elif [[ "${active_image}" == nurse-hand-server-local:rollback-* ]]; then
  active_phase='rollback'
fi
if [[ "${FAKE_SCENARIO}" == "baseline-external-health-fail" && "${active_phase}" == 'baseline' ]]; then
  exit 1
fi
if [[ "${FAKE_SCENARIO}" == "external-health-fail" && "${active_phase}" == 'replacement' ]]; then
  exit 1
fi
FAKE_CURL

  cat > "${root}/bin/sleep" <<'FAKE_SLEEP'
#!/usr/bin/env bash
exit 0
FAKE_SLEEP

  chmod 750 "${root}/bin/docker" "${root}/bin/curl" "${root}/bin/sleep"
  printf '%s\n' "${root}"
}

run_deploy() {
  local root="$1"
  local scenario="$2"
  local run_id="${3:-101}"

  PATH="${root}/bin:${PATH}" \
    FAKE_ACTIVE_IMAGE_FILE="${root}/active-image" \
    FAKE_COMMAND_LOG="${root}/commands.log" \
    FAKE_SCENARIO="${scenario}" \
    DEPLOY_HEALTHCHECK_ATTEMPTS=2 \
    DEPLOY_HEALTHCHECK_INTERVAL_SECONDS=0 \
    DEPLOY_ROOT="${root}/deploy-root" \
    DEPLOY_RUN_ID="${run_id}" \
    DEPLOY_SHA="${DEPLOY_SHA}" \
    EXTERNAL_BASE_URL="https://api.example.invalid" \
    NURSE_HAND_SERVER_IMAGE="${NEW_IMAGE}" \
    bash "${DEPLOY_SCRIPT}"
}

test_successful_order_and_state() {
  local root
  root="$(create_scenario success)"
  run_deploy "${root}" success

  local pull_line migration_line replace_line
  pull_line="$(grep -nF "docker pull ${NEW_IMAGE}" "${root}/commands.log" | cut -d: -f1)"
  migration_line="$(grep -nF ' run --rm --no-deps --entrypoint npx api prisma migrate deploy' "${root}/commands.log" | cut -d: -f1)"
  replace_line="$(grep -nF ' up -d --no-deps api' "${root}/commands.log" | head -n1 | cut -d: -f1)"
  [[ "${pull_line}" -lt "${migration_line}" && "${migration_line}" -lt "${replace_line}" ]] \
    || fail_test 'pull, migration, and replacement order is invalid'
  [[ "$(cat "${root}/deploy-root/deploy-state/current")" == "101|${DEPLOY_SHA}|${NEW_IMAGE}|${OLD_IMAGE}" ]]
}

test_failure_before_replacement() {
  local scenario root
  for scenario in pull-fail migration-fail; do
    root="$(create_scenario "${scenario}")"
    if run_deploy "${root}" "${scenario}"; then
      fail_test "${scenario} unexpectedly succeeded"
    fi
    assert_not_contains "${root}/commands.log" ' up -d --no-deps api'
    [[ "$(cat "${root}/active-image")" == "${OLD_IMAGE}" ]]
  done
}

test_unhealthy_baseline_stops_before_mutation() {
  local scenario root
  for scenario in baseline-container-health-fail baseline-external-health-fail; do
    root="$(create_scenario "${scenario}")"
    if run_deploy "${root}" "${scenario}"; then
      fail_test "${scenario} unexpectedly succeeded"
    fi
    assert_not_contains "${root}/commands.log" 'docker image tag'
    assert_not_contains "${root}/commands.log" "docker pull ${NEW_IMAGE}"
    assert_not_contains "${root}/commands.log" ' run --rm --no-deps --entrypoint npx api prisma migrate deploy'
    assert_not_contains "${root}/commands.log" ' up -d --no-deps api'
    [[ "$(cat "${root}/active-image")" == "${OLD_IMAGE}" ]]
    [[ ! -f "${root}/deploy-root/deploy-state/current" ]]
  done
}

test_readiness_failures_rollback() {
  local scenario root
  for scenario in container-health-fail storage-fail external-health-fail; do
    root="$(create_scenario "${scenario}")"
    if run_deploy "${root}" "${scenario}"; then
      fail_test "${scenario} unexpectedly succeeded"
    fi
    if [[ "$(grep -cF ' up -d --no-deps api' "${root}/commands.log")" -lt 2 ]]; then
      fail_test "${scenario} did not replace and then restore the API"
    fi
    [[ "$(cat "${root}/active-image")" == nurse-hand-server-local:rollback-* ]]
    [[ ! -f "${root}/deploy-root/deploy-state/current" ]]
  done
}

test_stale_run_is_rejected() {
  local root
  root="$(create_scenario stale)"
  printf '200|%s|%s|%s\n' \
    "${OLD_SHA}" \
    "${OLD_IMAGE}" \
    "${OLD_IMAGE}" > "${root}/deploy-root/deploy-state/current"
  if run_deploy "${root}" stale 199; then
    fail_test 'stale deployment unexpectedly succeeded'
  fi
  assert_not_contains "${root}/commands.log" "docker pull ${NEW_IMAGE}"
}

test_server_lock_rejects_overlap() {
  command -v flock >/dev/null 2>&1 || fail_test 'flock is required for tests'
  local root lock_fd
  root="$(create_scenario lock)"
  exec {lock_fd}>"${root}/deploy-root/deploy.lock"
  flock -n "${lock_fd}"
  if run_deploy "${root}" lock; then
    fail_test 'overlapping deployment unexpectedly succeeded'
  fi
  flock -u "${lock_fd}"
  exec {lock_fd}>&-
  assert_not_contains "${root}/commands.log" "docker pull ${NEW_IMAGE}"
}

if [[ "$(id -u)" == '0' ]]; then
  echo 'deploy tests require a non-root runner' >&2
  exit 1
fi

test_successful_order_and_state
test_unhealthy_baseline_stops_before_mutation
test_failure_before_replacement
test_readiness_failures_rollback
test_stale_run_is_rejected
test_server_lock_rejects_overlap

echo 'deployment script tests passed'
