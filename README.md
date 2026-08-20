# Nurse Hand Server

Nurse Hand 모바일 앱의 API와 비동기 작업을 담당하는 Node.js 서버 저장소입니다.

서버 Foundation은 Node.js 24, NestJS 11, TypeScript, Prisma와 PostgreSQL을 기준으로 합니다. 공개 API 계약은 Controller와 DTO에서 생성한 OpenAPI로 관리합니다.

## 시작하기

요구 버전은 `.nvmrc`, `package.json`과 `package-lock.json`을 기준으로 합니다.

```powershell
npm ci
npm run start:dev
```

로컬 Docker 실행은 git에 올리지 않는 `.env`를 사용합니다.

```bash
docker build -t nurse-hand-server:dev .
docker compose --env-file .env -f docker-compose.local.yml up -d
```

`docker-compose.local.yml`은 로컬 테스트 기준으로 `db`, `api`, `ai`, `demo-ui`를 같이 띄웁니다.

- API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- Demo UI: `http://localhost:5173`
- PostgreSQL: `localhost:5432`

`docker-compose.prod.yml`은 가비아 단일 서버 배포 기준으로 `db`, `api`, `worker`, `ai`, `nginx`, `certbot`을 같이 띄웁니다. 운영 compose는 DB와 AI 서버 포트를 외부에 열지 않고, Docker Nginx가 `api.nursehand.com`의 `80/443` 요청을 API 컨테이너의 `api:3000`으로 프록시합니다. `/` 요청은 Swagger UI인 `/docs`로 이동합니다.

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d
```

반복 배포 스크립트는 인증서 발급이나 host 권한 변경을 수행하지 않습니다. 최초 TLS·방화벽·디렉터리 준비와 안전 배포 조건은 [단일 서버 안전 배포 운영 계약](docs/operations/safe-single-server-deployment.md)을 따릅니다.

필요하면 이미지와 데이터 경로를 `.env`로 바꿉니다.

- `NURSE_HAND_SERVER_IMAGE`
- `NURSE_HAND_AI_IMAGE`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DEEPGRAM_API_KEY`
- `PYANNOTE_AUTH_TOKEN`
- `FILE_STORAGE_HOST_ROOT`
- `DEMO_UI_PORT` (local compose 전용)
- `NO_LOGIN_MVP_CONTEXT` (`true`이면 `DEMO_MODE=false`에서도 MVP 시연용 synthetic context를 자동 생성)
- `NO_LOGIN_MVP_DATASET_ID`
- `AI_BASE_URL` (업무 우선순위 제안 AI 서버 URL, Docker Compose 기본값은 `http://ai:8000`)
- `INTERNAL_API_TOKEN` (Docker Compose에서 AI 컨테이너 인증과 API의 `AI_INTERNAL_API_TOKEN`에 함께 주입)
- `AI_INTERNAL_API_TOKEN` (Compose를 사용하지 않고 API를 직접 실행할 때 `AI_BASE_URL`과 함께 설정하며, 둘 다 미설정이면 해당 endpoint는 `503`)
- `AI_PRIORITY_TIMEOUT_MS` (AI URL·token 설정 시 선택, 기본 `15000`, 최대 `120000`)
- `WORKER_POLL_INTERVAL_MS` (비동기 작업 polling 간격, 기본 `1000`)
- `POSTGRES_DATA_DIR`
- `AI_DATA_DIR`
- `AI_TMP_DIR`
- `LETSENCRYPT_DIR`
- `CERTBOT_WEBROOT_DIR`
- `HTTP_PORT`
- `HTTPS_PORT`

운영 서버 배포는 git에 올리지 않는 `.env`를 사용합니다.

파일 업로드의 컨테이너 경로는 `/data/nurse-hand/uploads`로 고정하고, host 경로는 `FILE_STORAGE_HOST_ROOT`로 연결합니다. 운영에서는 가비아 서버의 블록 스토리지를 `/data`에 마운트한 뒤 `/data/nurse-hand/uploads`를 그대로 쓰면 됩니다.

- Health: `GET http://localhost:3000/api/v1/health`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`

PostgreSQL 연결 문자열은 `DATABASE_URL`로 주입합니다. 개발·테스트 기본값은 로컬 전용이며 운영 환경에서는 `DATABASE_URL`이 없으면 서버가 시작되지 않습니다.

## 검증

```powershell
npm run verify
npm run openapi:generate
npm run openapi:check
```

`openapi/public.json`은 생성 결과이므로 직접 수정하지 않습니다. Controller 또는 DTO를 변경한 뒤 `npm run openapi:generate`로 갱신합니다.

실제 PostgreSQL constraint와 동시성은 별도 명령으로 검증합니다. 이 명령은 `TEST_DATABASE_URL`이 없거나 database/schema가 안전한 `nh_it_*` prefix가 아니면 즉시 실패하며, SQLite나 로컬 기본 DB로 대체하지 않습니다.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://nh_it_user:nh_it_password@localhost:5432/nh_it_nurse_hand'
npm run test:integration
```

runner는 격리된 `nh_it_*` schema를 생성해 migration, seed, 재seed, PostgreSQL integration test를 실행한 뒤 검증된 그 schema만 정리합니다.

## 문서

- [GitHub 협업 컨벤션](docs/conventions/github.md)
- [기여 방법](CONTRIBUTING.md)
- [MVP 구현 범위](docs/decisions/mvp-scope.md)
- [API 계약 관리 규칙](docs/conventions/api-contract.md)
- [Backend 구현 컨벤션](docs/conventions/backend.md)
- [Prisma CLI 의존성 보안 예외](docs/decisions/prisma-cli-advisory.md)
- [Domain Foundation 이후 병렬 작업 소유 규칙](docs/decisions/domain-foundation-parallel-ownership.md)

## 아키텍처 경계

- Node.js 서버: 환자 및 라운딩 세션, 타임라인, 업무 우선순위, 인수인계 API와 작업 오케스트레이션, 후속 인증
- Python AI 서버: STT, 화자 분리, 구조화, AI 역질문 등 모델 추론
- React Native 앱: 로컬 VAD, 녹음 제어, 사용자 확인 및 수정 UI

환자 정보와 원본 음성은 민감정보로 취급합니다. 실제 데이터, 인증정보, 음성 파일을 저장소나 로그에 남기지 않습니다.
