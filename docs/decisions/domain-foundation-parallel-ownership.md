# Domain Foundation 이후 병렬 작업 소유 규칙

## 목적

Task와 Handoff는 Domain Foundation이 `dev`에 병합된 뒤 별도 Issue, branch, worktree, PR에서 병렬 구현한다. 이 문서는 두 작업이 공통 schema와 bootstrap 파일을 동시에 수정해 계약을 깨뜨리지 않도록 소유 경계를 고정한다.

## 시작 조건

- 두 worktree 모두 Domain Foundation이 반영된 동일한 최신 `origin/dev` SHA에서 시작한다.
- 각 작업은 시작 보고에 base SHA, 소유 경로, 금지 경로, 검증 명령을 기록한다.
- PostgreSQL 통합 테스트는 서로 다른 `nh_it_*` database 또는 schema를 사용한다.

## Synthetic dataset 표현

- synthetic 출처는 각 row에 같은 `source=SYNTHETIC` 값을 반복하지 않고 root인 `DemoDataset.kind=SYNTHETIC`로 한 번만 저장한다.
- 모든 synthetic resource는 필수 `datasetId`로 root dataset에 속하며, child 관계의 composite FK에도 `datasetId`를 포함해 다른 dataset의 resource 참조를 DB가 거부한다.
- scenario의 `logicalKey`는 dataset 내부 재seed에 사용하는 고정 synthetic 식별자다. 같은 dataset을 재seed하면 기존 PK UUID를 유지한다.
- `POST /api/v1/demo-sessions`는 호출마다 새 dataset과 새 resource PK UUID를 생성한다. 같은 scenario와 logical key여도 session 간 row를 재사용하지 않는다.
- `TimelineEvent.source`는 synthetic 여부가 아니라 `MANUAL`, `AI_AUDIO` 같은 실제 event provenance를 표현한다.

## 전담 경로

| 작업 | 소유 경로 | 허용되는 schema 파일 |
|---|---|---|
| Task | `src/modules/tasks/**`, Task 전용 test | `prisma/models/task.prisma` |
| Handoff | `src/modules/handoffs/**`, Handoff 전용 test | `prisma/models/handoff.prisma` |

Foundation에서 고정한 `TaskQueryPort`와 `TimelineReader` 계약 변경은 한 기능 branch가 임의로 수행하지 않고 통합 담당자 리뷰를 거친다. Handoff는 Task repository, Prisma model, Python client를 직접 import하지 않는다.

## 공통 파일 금지 경계

다음 파일과 경로는 Task/Handoff 기능 branch에서 직접 수정하지 않고 통합 담당자가 소유한다.

- `src/app.module.ts`
- `src/common/**`
- `src/infrastructure/database/**`
- `prisma/schema.prisma`
- `prisma/models/foundation-enums.prisma`
- `prisma/models/demo.prisma`
- `prisma/models/clinical-foundation.prisma`
- `prisma/models/ai-job.prisma`
- `prisma/migrations/**`
- `src/openapi/**`, `scripts/*openapi*`, `openapi/public.json`
- `.github/workflows/**`

기능 branch는 자신의 module과 전용 `.prisma` 파일을 구현하고, migration 통합과 `openapi/public.json` 재생성은 최신 코드를 모은 통합 작업에서 한 번만 수행한다. 공통 변경이 반드시 필요하면 기능 구현과 섞지 않고 영향과 consumer를 먼저 합의한다.

타 도메인 리소스를 참조해야 하는 feature branch는 상대 도메인 model에 inverse relation을 추가하지 않고 UUID scalar field만 자신의 model에 둔다. 공유 model 파일이나 상대 도메인 `.prisma` 파일을 수정해 relation/back-relation을 선점하지 않는다. dataset 경계를 포함한 composite FK와 필요한 inverse relation은 Task/Handoff 변경을 모은 integration owner가 충돌을 정리한 뒤 한 번만 추가하고 migration으로 검증한다.

## 통합 검증

- 각 기능 branch: 해당 unit test, lint, typecheck, build
- 통합 담당: migration 생성·검토, `npm run verify`, `npm run test:integration`, `npm run openapi:generate`, `npm run openapi:check`
- 생성 OpenAPI JSON과 migration SQL은 수동 병합하지 않고 통합된 source에서 다시 생성한다.
