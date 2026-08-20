# 단일 서버 안전 배포 운영 계약

이 문서는 GitHub Actions가 검증한 server image 한 개를 가비아 단일 서버의 API와 worker에 배포하는 절차를 정의합니다. 실제 SSH 접속, 운영 secret 등록, 방화벽 변경, backup 실행은 저장소 변경과 분리합니다.

## 배포 불변 조건

- CD는 `workflow_dispatch`로만 시작하며 실행 commit은 현재 `origin/main`과 정확히 같아야 합니다.
- 같은 commit에서 `verify`와 PostgreSQL integration이 모두 성공한 뒤에만 full Git SHA trace tag image를 push합니다.
- 실제 pull과 교체에는 build 결과의 `repository@sha256:...` digest를 사용합니다. `latest`나 덮어쓸 수 있는 tag는 배포 입력 또는 rollback 근거로 사용하지 않습니다.
- GitHub `production` Environment와 workflow concurrency를 사용하며 진행 중 실행을 취소하지 않습니다.
- 원격 서버에서는 `flock`과 마지막 성공 `GITHUB_RUN_ID`를 함께 검사합니다.
- image pull과 one-shot `prisma migrate deploy`가 성공할 때까지 현재 API와 worker container를 유지합니다.
- 현재 API와 worker가 같은 image를 사용하고 둘 다 준비됐으며 외부 health·무로그인 MVP 환자 조회가 성공해야 pull과 migration을 시작합니다.
- migration 뒤에는 같은 digest로 API와 worker만 교체합니다. worker 시작 명령은 migration을 다시 실행하지 않습니다. DB, AI, Nginx, Certbot은 일상 server 배포에서 pull하거나 재기동하지 않습니다.
- 새 API readiness, worker의 DB poll 성공 heartbeat, storage create/rename/delete, redirect 없는 외부 health·무로그인 MVP 환자 JSON envelope가 모두 성공해야 배포 상태를 기록합니다.
- worker는 시작할 때 이전 heartbeat를 제거하고 DB poll 성공 직후 및 각 scope 처리 완료 시각을 기록합니다. 120초 동안 새 기록이 없으면 장시간 operation 정지를 포함한 무진행 상태로 보고 unhealthy 처리하며, payload나 오류 원문은 heartbeat와 health log에 기록하지 않습니다.
- readiness 실패 시 배포 직전 공통 image ID를 붙인 로컬 rollback tag로 API와 worker를 함께 복구하고 readiness를 다시 확인합니다.
- 자동 schema downgrade는 수행하지 않습니다. 운영 migration은 직전 API와 공존 가능한 forward-only 변경이어야 합니다.

## GitHub 설정

### Environment

`production` Environment를 만들고 가능한 저장소 요금제에서는 required reviewer를 설정합니다. Workflow의 `environment: production` 선언만으로 승인 규칙이 생기지는 않습니다. required reviewer를 지원하지 않는 환경에서는 수동 실행이 사람의 시작 게이트 역할을 하지만 완료 조건을 완전히 대신하지는 않습니다.

### Repository secrets

| 이름                           | 용도                                           |
| ------------------------------ | ---------------------------------------------- |
| `DOCKERHUB_USERNAME`           | API image push 계정                            |
| `DOCKERHUB_TOKEN`              | API repository push만 허용하는 CI token        |
| `GABIA_SSH_HOST`               | 사전 확인한 서버 host                          |
| `GABIA_SSH_PORT`               | SSH port, 없으면 `22`                          |
| `GABIA_SSH_USER`               | `root`가 아닌 배포 계정                        |
| `GABIA_SSH_PRIVATE_KEY_BASE64` | 전용 private key 파일의 base64 원문            |
| `GABIA_SSH_KNOWN_HOSTS`        | 별도 신뢰 경로에서 확인한 host public key line |

Private key는 raw multiline 문자열을 임의로 escape하지 않습니다. 원본 파일을 줄바꿈 없이 base64로 변환해 저장하고 workflow에서 decode한 뒤 `ssh-keygen -y`로 parse합니다. Public key는 배포 계정의 `authorized_keys`에만 등록합니다.

`GABIA_SSH_KNOWN_HOSTS`는 배포 실행 중 `ssh-keyscan`으로 즉석 신뢰하지 않습니다. 서버 생성 또는 관리 화면 등 별도 경로에서 얻은 host key fingerprint를 확인한 뒤 OpenSSH `known_hosts` line을 저장합니다.

### Repository variables

| 이름                           | 기본값                      | 용도                      |
| ------------------------------ | --------------------------- | ------------------------- |
| `DOCKERHUB_SERVER_REPOSITORY`  | `nursehand-server`          | API image repository 이름 |
| `GABIA_DEPLOY_ROOT`            | `/data/nurse-hand`          | 서버의 제한된 배포 root   |
| `NURSE_HAND_EXTERNAL_BASE_URL` | `https://api.nursehand.com` | 외부 readiness origin     |

## 서버 사전 준비

이 절차는 최초 설치가 아니라 기존 정상 API와 worker를 보존하는 반복 배포용입니다. 최초 두 container와 `.env`는 별도 검증 절차로 준비합니다.

1. `root`가 아닌 전용 계정을 만듭니다.
2. `/data/nurse-hand`, `releases`, `deploy-state`, `uploads`를 미리 만들고 필요한 최소 소유권을 부여합니다.
3. 배포 계정이 `docker compose`, `docker pull`, `docker image tag`를 실행할 수 있게 구성합니다. 일반 Docker daemon의 `docker` group은 host root와 동등한 권한을 가질 수 있으므로 계정 접근 범위를 별도로 제한합니다.
4. private Docker Hub repository를 사용하면 서버에는 pull-only token으로 한 번 `docker login`합니다. CI의 push token을 서버로 전달하지 않습니다. Public repository이면 원격 registry credential이 필요 없습니다.
5. `${GABIA_DEPLOY_ROOT}/.env`를 Git 밖에서 만들고 권한을 제한합니다.
6. `deploy-state`와 deploy root는 배포 계정이 쓸 수 있어야 하고 uploads bind mount는 container UID/GID `10001:10001`이 쓸 수 있어야 합니다.
7. `flock`, Docker Compose v2, `curl`이 설치돼 있어야 합니다.

배포 계정이 routine script에서 `systemctl`, `chown`, 인증서 발급을 수행하게 하지 않습니다. Host Nginx 전환, 인증서 최초 발급, 디렉터리 소유권 변경은 사전 준비 작업입니다.

## 운영 `.env` 필수 계약

실제 값은 저장소나 로그에 남기지 않습니다. 최소한 다음 이름을 서버 `.env`에서 관리합니다.

```dotenv
DATABASE_URL=
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
POSTGRES_DATA_DIR=
FILE_STORAGE_HOST_ROOT=/data/nurse-hand/uploads
DEMO_MODE=false
NO_LOGIN_MVP_CONTEXT=true
NO_LOGIN_MVP_DATASET_ID=00000000-0000-4000-8000-000000000101
INTERNAL_API_TOKEN=
```

`NODE_ENV=production`, container 내부 `FILE_STORAGE_ROOT=/data/nurse-hand/uploads`는 compose가 고정합니다. 원본 캘린더·환자 데이터·token을 `.env` 예시에 넣지 않습니다.

`INTERNAL_API_TOKEN`은 API가 시작될 때 비어 있지 않아야 합니다. Compose는 이 값을 `AI_INTERNAL_API_TOKEN`으로 전달하고 API가 누락을 즉시 거부하므로, 실제 token은 Git에 기록하지 않고 서버 `.env`에만 주입합니다.

## 배포 순서

1. 현재 main exact SHA와 실행 ref를 검사합니다.
2. 같은 SHA로 정적 검증·unit·E2E·PostgreSQL integration을 실행합니다.
3. `${repository}:${full_sha}` trace tag 한 개를 build/push하고 build digest를 배포 대상으로 기록합니다.
4. production Environment 승인을 거친 뒤 현재 main exact SHA를 다시 검사하고 SSH key와 known_hosts를 검증합니다.
5. 해당 commit의 compose와 deploy scripts를 SHA/run별 release directory로 복사합니다.
6. 서버 lock과 last run ID를 검사합니다.
7. 현재 API와 worker가 같은 image인지, API container readiness와 worker 실행 상태, 외부 `/api/v1/health`, `/api/v1/patients` 기준선을 확인합니다.
8. 현재 공통 image ID에 run별 rollback tag를 붙입니다.
9. 새 image를 pull하고 임시 container에서 migration을 수행합니다.
10. API와 worker를 같은 digest로 교체하고 API health 및 worker DB poll 성공 heartbeat를 기다립니다.
11. UID 10001 container가 bind mount에서 create/rename/delete 가능한지 확인합니다.
12. 외부 `/api/v1/health`와 `/api/v1/patients`가 redirect 없이 HTTP 200과 예상 JSON envelope를 반환하는지 다시 확인합니다.
13. 성공한 image, SHA, run ID를 작은 상태 파일에 원자적으로 기록합니다.

## 실패와 복구

- 기존 API·worker의 image 불일치, 배포 전 readiness 또는 외부 readiness 실패: image tag, pull, migration, 교체, 상태 기록 없이 실패합니다.
- pull 또는 migration 실패: 기존 API와 worker를 교체하지 않고 실패합니다.
- API·worker 교체, readiness, storage smoke, 외부 readiness 실패: 직전 공통 image ID의 로컬 rollback tag로 두 container를 함께 복구합니다.
- rollback readiness도 실패: 자동 성공으로 처리하지 않고 수동 복구가 필요한 실패로 종료합니다.
- 실패 실행은 `last-run-id`와 현재 image 상태를 갱신하지 않습니다.
- routine script는 image prune을 실행하지 않습니다. 현재·직전 image 보존 정책을 확인한 별도 운영 작업에서만 정리합니다.

운영 DB migration은 rollback image와 호환돼야 합니다. 파괴적 schema 변경은 expand/contract 단계로 나누고 별도 backup·restore 검증 전에는 배포하지 않습니다.

## 검증

```bash
bash -n deploy/deploy-server.sh
bash deploy/deploy-server.test.sh
docker compose --env-file /path/to/synthetic.env -f docker-compose.prod.yml config --quiet
npm run verify
npm run test:integration
```

`deploy-server.test.sh`는 fake Docker/curl을 사용해 API·worker baseline 실패와 image 불일치의 무변경 종료, pull 실패, migration 실패, 교체 후 API·worker/storage/external readiness 실패 rollback, 오래된 run 거부, server lock을 결정론적으로 검증합니다. Linux non-root 환경에서 실행해야 합니다.

## 별도 결정·운영 작업

다음 항목은 코드에서 임의로 확정하지 않습니다.

- PostgreSQL을 같은 compose에서 유지할지 외부 DB로 전환할지
- Python AI service를 기본 기동할지 선택 profile로 분리할지
- RAM 4GB에서 서비스별 memory/CPU 수치를 얼마로 둘지
- host 디스크 용량과 보존 요구에 맞춘 Docker log `max-size`·`max-file` 값
- 실제 key/token 생성·폐기·회전과 host `authorized_keys` 반영
- host firewall 규칙과 TLS 인증서 최초 발급
- backup 보존 주기와 실제 restore drill

Topology와 memory 수치는 실제 API 최대 upload 동시성 및 AI model peak memory를 측정한 뒤 별도 변경으로 고정합니다.
