#!/usr/bin/env bash
set -euo pipefail

: "${DOCKERHUB_USERNAME:?DOCKERHUB_USERNAME is required}"
: "${DOCKERHUB_TOKEN:?DOCKERHUB_TOKEN is required}"

if [[ ! -f .env ]]; then
  echo "Missing .env in $(pwd). Create it on the server before deploying." >&2
  exit 1
fi

if [[ ! -f docker-compose.prod.yml ]]; then
  echo "Missing docker-compose.prod.yml in $(pwd)." >&2
  exit 1
fi

printf '%s' "${DOCKERHUB_TOKEN}" \
  | docker login --username "${DOCKERHUB_USERNAME}" --password-stdin

docker compose --env-file .env -f docker-compose.prod.yml pull
docker compose --env-file .env -f docker-compose.prod.yml up -d --remove-orphans

docker image prune -f --filter "until=168h" >/dev/null
docker compose --env-file .env -f docker-compose.prod.yml ps
