#!/usr/bin/env bash
set -euo pipefail

: "${NURSE_HAND_SERVER_IMAGE:?NURSE_HAND_SERVER_IMAGE is required}"
: "${DOCKERHUB_USERNAME:?DOCKERHUB_USERNAME is required}"
: "${DOCKERHUB_TOKEN:?DOCKERHUB_TOKEN is required}"

if [[ ! -f .env ]]; then
  echo "Missing .env in $(pwd). Create it on the server before deploying." >&2
  exit 1
fi

printf '%s' "${DOCKERHUB_TOKEN}" \
  | docker login --username "${DOCKERHUB_USERNAME}" --password-stdin

docker pull "${NURSE_HAND_SERVER_IMAGE}"
NURSE_HAND_SERVER_IMAGE="${NURSE_HAND_SERVER_IMAGE}" \
  docker compose -f docker-compose.prod.yml up -d --remove-orphans

docker image prune -f --filter "until=168h" >/dev/null
docker compose -f docker-compose.prod.yml ps
