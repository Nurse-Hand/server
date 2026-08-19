#!/usr/bin/env bash
set -euo pipefail

: "${NURSE_HAND_SERVER_IMAGE:?NURSE_HAND_SERVER_IMAGE is required}"
: "${DOCKERHUB_USERNAME:?DOCKERHUB_USERNAME is required}"
: "${DOCKERHUB_TOKEN:?DOCKERHUB_TOKEN is required}"
API_DOMAIN="${API_DOMAIN:-api.nursehand.com}"
LETSENCRYPT_DIR="${LETSENCRYPT_DIR:-/data/nurse-hand/letsencrypt}"
CERTBOT_WEBROOT_DIR="${CERTBOT_WEBROOT_DIR:-/data/nurse-hand/certbot/www}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

if [[ ! -f .env ]]; then
  echo "Missing .env in $(pwd). Create it on the server before deploying." >&2
  exit 1
fi

if [[ ! -f docker-compose.prod.yml ]]; then
  echo "Missing docker-compose.prod.yml in $(pwd)." >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop nginx >/dev/null 2>&1 || true
  systemctl disable nginx >/dev/null 2>&1 || true
fi

printf '%s' "${DOCKERHUB_TOKEN}" \
  | docker login --username "${DOCKERHUB_USERNAME}" --password-stdin

docker pull "${NURSE_HAND_SERVER_IMAGE}"
NURSE_HAND_SERVER_IMAGE="${NURSE_HAND_SERVER_IMAGE}" \
  docker compose --env-file .env -f docker-compose.prod.yml pull
NURSE_HAND_SERVER_IMAGE="${NURSE_HAND_SERVER_IMAGE}" \
  docker compose --env-file .env -f docker-compose.prod.yml up -d --remove-orphans

CERT_FULLCHAIN="${LETSENCRYPT_DIR}/live/${API_DOMAIN}/fullchain.pem"
CERT_KEY="${LETSENCRYPT_DIR}/live/${API_DOMAIN}/privkey.pem"

if [[ ! -s "${CERT_FULLCHAIN}" || ! -s "${CERT_KEY}" ]]; then
  if [[ -z "${CERTBOT_EMAIL}" ]]; then
    echo "CERTBOT_EMAIL is required to issue a new certificate." >&2
    exit 1
  fi

  docker compose --env-file .env -f docker-compose.prod.yml run --rm certbot \
    certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email "${CERTBOT_EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    -d "${API_DOMAIN}"

  NURSE_HAND_SERVER_IMAGE="${NURSE_HAND_SERVER_IMAGE}" \
    docker compose --env-file .env -f docker-compose.prod.yml restart nginx
fi

docker image prune -f --filter "until=168h" >/dev/null
NURSE_HAND_SERVER_IMAGE="${NURSE_HAND_SERVER_IMAGE}" \
  docker compose --env-file .env -f docker-compose.prod.yml ps
