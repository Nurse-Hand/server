# Backend Rules

## 현재 시스템 경계

- 이 저장소는 Node.js API와 비동기 작업 오케스트레이션을 담당합니다.
- 모델 추론은 별도의 Python AI 서비스에 위임합니다.
- 모바일 앱에서 수행하는 로컬 VAD를 서버 책임으로 중복 구현하지 않습니다.
- 현재 서버 foundation은 NestJS, TypeScript, Prisma, PostgreSQL을 기준으로 구성되어 있습니다.

## Node/NestJS 코드 구조

- 기능 코드는 `src/modules/<domain>` 아래에 도메인별 Nest module로 둡니다.
- 새 도메인 module은 아래 구조를 기본값으로 사용합니다.

```text
src/modules/<domain>/
├─ presentation/       # Controller, request DTO, response DTO, response mapper
├─ application/        # Use case service, transaction orchestration, Port
├─ domain/             # 순수 정책, 상태 전이, error, value object
├─ infrastructure/     # Prisma repository, 외부 HTTP adapter, local storage adapter
└─ <domain>.module.ts
```

- `presentation`은 HTTP 입력 검증, 공통 응답 envelope, application service 호출만 담당합니다.
- 비즈니스 규칙, 상태 전이, 우선순위 계산, AI 결과 검증은 Controller에 두지 않습니다.
- `domain`은 NestJS decorator, Prisma client, HTTP client에 의존하지 않습니다.
- `application`은 use case와 transaction 경계를 소유합니다. 외부 AI 호출을 열린 DB transaction 안에서 기다리지 않습니다.
- `infrastructure`는 Port 구현체를 둡니다. 다른 도메인의 Prisma repository를 직접 import하기 전에 Port가 필요한 경계인지 확인합니다.
- `src/app.module.ts`, `src/common/**`, `src/infrastructure/database/**`, `prisma/schema.prisma` 같은 공유 파일은 병렬 작업 충돌 지점입니다. 수정이 필요하면 Issue 본문에 근거를 남기고 최소 범위로 변경합니다.

## 파일과 이름 규칙

- 파일명은 `kebab-case`를 사용합니다. 예: `rounding-session.service.ts`, `create-rounding-session.dto.ts`.
- class/type/interface는 `PascalCase`, 변수와 함수는 `camelCase`, error code와 enum literal은 `UPPER_SNAKE_CASE`를 사용합니다.
- Controller는 `<domain>.controller.ts`, application service는 `<use-case>.service.ts`, Prisma 구현은 `prisma-<domain>.repository.ts` 형태를 우선합니다.
- request DTO와 response DTO는 분리합니다. Prisma model이나 DB row를 API 응답 타입으로 직접 노출하지 않습니다.
- mapper 함수는 공개 가능한 필드만 명시적으로 복사합니다.
- `any`, non-null assertion, 의미 없는 type assertion을 피합니다. 외부 입력은 DTO 또는 명시 validator로 검증합니다.

## API와 데이터

- 요청 DTO, 응답 DTO, 상태 코드를 코드와 테스트에서 함께 관리합니다.
- 외부 AI 작업은 `requestId` 또는 동등한 키로 중복 요청을 식별할 수 있게 설계합니다.
- 오래 걸리는 STT, 화자 분리, 구조화 작업은 HTTP 요청 안에서 무기한 대기시키지 않습니다.
- 재시도 가능한 오류와 사용자 수정이 필요한 오류를 구분합니다.
- 타임라인, 업무 우선순위, AI 역질문 결과에는 생성 근거와 사용자 확인 상태를 추적할 수 있어야 합니다.
- 공개 응답은 `data`와 `meta.requestId` 형태의 공통 envelope를 따릅니다.
- body/query/path에 들어온 `actorId`, `wardId`, `datasetId`를 그대로 신뢰하지 않고 demo session context에서 복원한 값을 기준으로 검증합니다.

## 보안과 비용

- 환자 이름, 병실, 진료 정보, 원본 음성, transcript 전문을 일반 애플리케이션 로그에 기록하지 않습니다.
- 인증정보는 환경변수나 secret manager에서 주입하고 저장소에 커밋하지 않습니다.
- 업로드 파일은 크기, 형식, 재생시간을 검증하고 보관 기간을 명시합니다.
- AI API 호출에는 timeout, 호출 횟수 제한, 재시도 상한, 비용 관측 지표를 둡니다.
- 원본 데이터와 AI 생성 결과의 삭제 정책을 API 및 저장 계층에 반영합니다.
- `.env`, 원본 음성, 실제 환자 데이터, 운영 로그, 토큰은 Issue/PR 본문과 commit에 포함하지 않습니다.
- `.env.example`에는 값이 비어 있거나 가짜 값인 설정 이름만 둡니다.
- 세부 기획 초안, Notion export, 로컬 실험 노트는 Git 추적 대상이 아닙니다. 필요한 결정만 Issue 또는 코드 테스트로 옮깁니다.

## DB와 Prisma

- 도메인별 schema는 `prisma/models/<domain>.prisma`로 나눕니다.
- 모든 MVP resource는 demo context 격리를 위해 가능한 한 `datasetId`, `wardId` 또는 이에 준하는 scope key를 가집니다.
- `pgvector`를 사용하는 embedding column은 차원 수와 생성 주체를 주석 또는 model 이름으로 명확히 합니다.
- migration은 빈 DB 적용과 기존 데이터 영향 여부를 PR에 적습니다.
- DB 제약은 멱등성, 중복 방지, 상태 전이의 최종 방어선으로 사용합니다.

## 검증

- 동작 변경에는 정상, 권한 실패, 입력 오류, 외부 서비스 실패 중 관련 케이스를 테스트합니다.
- API 계약 변경 시 모바일 및 Python AI 서비스에 미치는 영향을 PR에 기록합니다.
- 실제 환자 데이터 대신 비식별 synthetic fixture를 사용합니다.
- 순수 정책은 unit test, repository/transaction은 PostgreSQL integration test, 공개 API는 e2e test로 검증합니다.
- mock data는 실제 환자 정보가 아닌 synthetic data를 사용하고, 원본 음성 바이너리는 저장소에 넣지 않습니다.
- 실행하지 못한 검증은 통과로 보고하지 않고 실패 로그 또는 미실행 사유를 PR에 남깁니다.
