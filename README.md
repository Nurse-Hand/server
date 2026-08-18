# Nurse Hand Server

Nurse Hand 모바일 앱의 API와 비동기 작업을 담당하는 Node.js 서버 저장소입니다.

서버 Foundation은 Node.js 24, NestJS 11, TypeScript, Prisma와 PostgreSQL을 기준으로 합니다. 공개 API 계약은 Controller와 DTO에서 생성한 OpenAPI로 관리합니다.

## 시작하기

요구 버전은 `.nvmrc`, `package.json`과 `package-lock.json`을 기준으로 합니다.

```powershell
npm ci
Copy-Item .env.example .env
npm run start:dev
```

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
