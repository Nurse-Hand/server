# Backend 구현 컨벤션

## 1. 기술 기준

- Runtime: Node.js와 TypeScript
- Framework: NestJS
- Database: PostgreSQL
- ORM: Prisma
- API 문서: NestJS Swagger에서 생성한 OpenAPI
- 모델 추론: 별도 Python AI 서비스, 이 저장소에서는 Port와 Adapter로 연동

Node.js와 package manager의 정확한 버전은 저장소의 version 파일과 `packageManager` 필드를 따른다. dependency, DB schema, 인증·인가, 공통 응답을 변경할 때는 이유와 영향 범위를 Issue와 PR에 명시한다.

## 2. 모듈 경계

기능은 도메인 기준 Nest module로 나눈다.

```text
src/
├─ modules/
│  └─ tasks/
│     ├─ presentation/       # Controller, request/response DTO
│     ├─ application/        # Use case, transaction orchestration
│     ├─ domain/             # Domain model, policy, Port
│     ├─ infrastructure/     # Prisma repository, 외부 Adapter
│     └─ tasks.module.ts
├─ common/                   # 검증된 공통 응답, 오류, filter, guard
└─ infrastructure/           # Prisma, config, 전역 외부 의존성
```

- 경로 이름은 실제 스캐폴딩에서 확정한 하나의 구조를 일관되게 사용한다.
- Controller에는 HTTP 변환과 validation 이후의 use case 호출만 둔다.
- 비즈니스 규칙, 상태 전이, 우선순위 계산은 Controller에 두지 않는다.
- application service는 use case와 transaction 경계를 소유한다.
- domain은 NestJS, Prisma, HTTP client에 의존하지 않는다.
- infrastructure는 domain/application Port를 구현한다.
- 다른 도메인의 Prisma repository를 직접 import하지 않고 필요한 query를 Port로 노출한다.
- 순환 참조를 `forwardRef`로 숨기기 전에 모듈 경계와 Port를 다시 검토한다.

Task와 Handoff의 대표 공유 경계는 다음과 같다.

- `TimelineReader`
- `TaskQueryPort`
- `TaskExtractionAiGateway`
- `TaskPriorityAiGateway`
- `HandoffPrecheckAiGateway`
- `HandoffDraftAiGateway`

이름은 구현 시 조정할 수 있지만, Handoff가 Task repository나 Python client 세부사항에 직접 결합되어서는 안 된다.

## 3. Controller와 DTO

- request와 response DTO를 별도 class로 정의한다.
- `class-validator`와 변환 설정으로 body, path, query를 runtime에서 검증한다.
- whitelist를 사용하고 알려지지 않은 입력 필드는 거부한다.
- Prisma model, DB row, domain entity를 API 응답으로 직접 반환하지 않는다.
- response mapper에서 공개 가능한 필드만 명시적으로 구성한다.
- optional, nullable, 빈 배열, 생략의 의미를 구분해 OpenAPI에 표현한다.
- PATCH DTO는 수정 가능한 필드만 허용하고 ID, 소유자, 확정 시각 같은 서버 관리 필드는 받지 않는다.
- 공통 응답과 상태 코드는 `docs/conventions/api-contract.md`를 따른다.

## 4. Application과 Domain

- 한 service method는 하나의 use case를 명확히 표현한다.
- 상태 전이는 허용 목록으로 검사하고 잘못된 전이는 domain error로 거부한다.
- AI 제안, Node.js 규칙값, 사용자 확정값을 하나의 필드에 덮어쓰지 않는다.
- AI 결과에는 근거 ID, model/contract version, 생성 시각, 사용자 확인 상태를 추적한다.
- 최종 확정된 인수인계는 mutable draft와 분리한 snapshot으로 보존한다.
- 수신 확인과 열람·변경 이력은 원본 문서를 수정하지 않는 append-only 기록을 우선한다.
- 시간에 의존하는 정책은 `Date.now()`를 여기저기 호출하지 않고 주입 가능한 Clock을 사용한다.
- 정렬 규칙은 DB와 메모리에서 결과가 달라지지 않도록 마지막 tie-breaker까지 정의한다.

## 5. Repository와 Prisma

- repository interface는 application/domain 경계에, Prisma 구현은 infrastructure에 둔다.
- 필요한 column만 `select`하고 relation 전체를 기본 조회하지 않는다.
- 목록 조회의 relation 접근은 N+1이 생기지 않도록 query 수와 실행 계획을 검토한다.
- pagination, filter, sort는 repository 입력 객체로 명시한다.
- 존재 확인 후 갱신하는 경쟁 조건은 조건부 update 또는 transaction으로 해결한다.
- DB unique constraint를 멱등성, 자연키 중복 방지의 최종 방어선으로 사용한다.
- Prisma 예외를 Controller까지 노출하지 않고 안정적인 application error로 변환한다.
- migration과 application code는 호환 가능한 순서로 배포할 수 있게 작성한다.
- schema 변경 PR에는 데이터 이관, rollback/forward-fix, 기존 데이터 영향 여부를 적는다.

## 6. Transaction과 동시성

- transaction은 application service의 use case 경계에서 시작하고 외부 AI HTTP 호출을 열린 DB transaction 안에서 기다리지 않는다.
- 외부 호출 전 요청 상태를 commit하고, 결과 반영은 별도 짧은 transaction으로 처리한다.
- 수정·확정 API는 `version` 또는 동등한 optimistic concurrency key를 검사한다.
- 최종 확정, 후보 선택 반영, 수신 확인처럼 중복 부작용이 있는 명령은 idempotency key를 처리한다.
- transaction 재시도가 가능한 오류와 사용자 입력 수정이 필요한 오류를 구분한다.
- 완료 여부가 모호한 외부 호출은 `requestId`로 상태를 조회하거나 동일 요청을 안전하게 재처리한다.

## 7. 외부 AI 연동

- application은 interface에만 의존하고 개발·테스트용 Mock Adapter와 실제 HTTP Adapter를 교체할 수 있어야 한다.
- 실제 Adapter는 Python FastAPI OpenAPI에 맞춰 요청과 응답을 runtime 검증한다.
- 모든 호출에 request ID, 제한된 timeout, 호출 횟수 상한을 둔다.
- 자동 재시도는 안전한 오류와 멱등성이 보장된 요청에만 제한적으로 적용한다.
- `429`, timeout, 잘못된 응답, 모델 비가용을 서로 다른 application error로 변환한다.
- AI 실패 시 부분 결과가 정상 결과처럼 노출되지 않도록 작업 상태와 결과 commit을 원자적으로 처리한다.
- 호출 수, latency, 성공·실패 code는 관측하되 prompt, 환자 정보, transcript 전문은 로그에 남기지 않는다.
- Python 구현 세부사항이나 모델 SDK를 domain code로 끌어오지 않는다.

## 8. 비동기 작업

공통 상태는 다음 의미로 사용한다.

```text
QUEUED → PROCESSING → SUCCEEDED
                    ↘ FAILED
```

- worker가 처리할 작업은 claim 시각, attempt, request ID를 추적한다.
- 동일 작업을 두 worker가 동시에 처리하지 못하도록 원자적 claim을 사용한다.
- 무한 재시도를 금지하고 최대 attempt와 최종 실패 사유를 저장한다.
- worker 재시작 후 `PROCESSING`에 고립된 작업을 복구할 lease 또는 timeout 정책을 둔다.
- Job DTO와 domain 상태를 외부 AI provider 상태에 직접 종속하지 않는다.
- Redis/BullMQ 등 추가 인프라는 실제 요구와 Issue 합의 없이 도입하지 않는다. PostgreSQL 구현으로 시작하더라도 Port를 통해 교체 가능하게 한다.

## 9. 오류 처리와 로깅

- domain/application error를 전역 exception filter에서 공개 error code와 HTTP status로 변환한다.
- `NotFoundException` 같은 HTTP 예외를 domain과 repository에서 직접 던지지 않는다.
- error code는 도메인 prefix를 사용해 충돌을 피한다. 예: `TASK_NOT_FOUND`, `HANDOFF_VERSION_CONFLICT`.
- 예상 가능한 오류를 `500`으로 뭉개지 않는다.
- 로그는 구조화하고 `requestId`, 안전한 resource ID, error code를 포함한다.
- 환자 이름, 병실, 진료 정보, transcript, 원본 음성, 인증정보, cookie, 내부 token은 로그에 넣지 않는다.
- 외부 오류의 body 전문과 stack trace를 공개 응답 또는 PR 증거에 붙이지 않는다.

## 10. 보안과 데이터

- 실제 환자 데이터 대신 synthetic fixture를 사용한다.
- 환경변수는 시작 시 schema validation하고 누락되면 fail fast한다.
- secret은 환경변수 또는 배포 secret manager에서 주입하며 저장소와 OpenAPI example에 넣지 않는다.
- 파일 업로드는 크기, MIME type, 확장자, 재생시간을 서버에서 검증한다.
- 저장 object는 공개 URL을 기본으로 하지 않고 접근 범위와 만료를 검사한다.
- 원본 음성·이미지·전사·AI 결과의 보관 및 삭제 정책을 해당 도메인 구현 전에 결정하고 테스트한다.
- body의 `userId`, `wardId`, `hospitalId`만으로 권한을 결정하지 않고 request context의 범위와 대조한다.

## 11. 테스트

### Unit

- 우선순위, 상태 전이, validation 보조 정책, mapper 같은 순수 로직을 테스트한다.
- 시간과 UUID는 고정 가능한 dependency를 주입한다.
- AI 제안 수락·수정과 Node.js 규칙 fallback을 각각 검증한다.

### Integration

- 실제 PostgreSQL 호환 테스트 DB에서 Prisma query, constraint, transaction을 검증한다.
- repository의 filter, sort, pagination, 중복 방지와 optimistic locking을 확인한다.
- migration을 빈 DB에 적용하는 테스트를 둔다.

### API/E2E

- 정상 응답뿐 아니라 입력 오류, 접근 범위 실패, 없음, 충돌, 외부 AI 실패를 검증한다.
- 공개 응답이 DTO보다 많은 필드를 노출하지 않는지 확인한다.
- idempotency key로 같은 요청을 반복했을 때 부작용이 한 번만 발생하는지 확인한다.
- 인수인계 최종본 불변성, 10개 기능의 상태 연결, 감사 이력을 검증한다.
- Mock AI와 실제 FastAPI OpenAPI artifact를 대상으로 contract test를 실행한다.

## 12. 검증 명령

`package.json`의 scripts를 단일 실행 기준으로 사용한다. Foundation은 최소한 다음 명령을 제공한다.

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run openapi:generate
npm run openapi:check
```

- 실행하지 못한 검증은 통과로 보고하지 않는다.
- 실패한 검증을 무관하다고 판단할 때도 실제 오류와 영향 범위를 기록한다.
- OpenAPI 생성 후 working tree가 달라지지 않아야 계약 동기화가 완료된 것이다.

## 13. Naming과 코드 품질

- 파일 이름은 저장소에서 확정한 하나의 kebab-case 규칙을 사용한다.
- class/type은 `PascalCase`, 변수·함수는 `camelCase`, 상수와 error code는 `UPPER_SNAKE_CASE`를 사용한다.
- boolean은 `is`, `has`, `can`, `should`처럼 의미가 드러나는 이름을 사용한다.
- `any`, non-null assertion, 의미 없는 type assertion을 피하고 외부 입력은 `unknown`에서 검증한다.
- 주석은 코드가 무엇을 하는지 반복하지 않고 정책의 이유나 외부 계약 제약을 설명할 때만 쓴다.
- 새 공통 추상화는 실제로 둘 이상의 consumer가 있거나 Foundation에서 합의된 경계일 때만 도입한다.
- 기능 변경과 무관한 대량 formatting 또는 refactor를 같은 PR에 섞지 않는다.

## 14. 병렬 작업과 리뷰

- `1 Issue = 1 branch = 1 worktree = 1 PR`을 따른다.
- Foundation 이후 Task와 Handoff는 각자의 module과 test 경로에서 병렬 구현한다.
- Prisma schema, 전역 Module, 공통 exception, OpenAPI bootstrap 같은 공유 파일은 통합 담당자가 관리한다.
- 병렬 작업은 시작 시 base SHA, 소유 경로, 금지 경로, 실행할 테스트를 기록한다.
- 통합 시 생성 OpenAPI 파일을 수동 병합하지 않고 최신 코드에서 다시 생성한다.
- 완료 보고에는 변경 파일, 실제 동작, 실행한 검증과 결과, 확인하지 못한 항목을 포함한다.
