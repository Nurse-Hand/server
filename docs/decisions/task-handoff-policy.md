# 업무·인수인계 구현 정책

## 1. 목적과 적용 범위

이 문서는 업무 공개 API 6개와 인수인계 공개 API 10개를 구현할 때 Notion 예시만으로 결정할 수 없는 규칙을 고정한다. API 개수와 Method·Endpoint는 `docs/decisions/mvp-scope.md`, 공개 요청·응답의 최종 계약은 NestJS 코드에서 생성한 OpenAPI를 기준으로 한다.

기능 범위를 줄이지 않는다. Python 모델 코드는 이 저장소에서 구현하지 않지만 Node.js의 application Port, deterministic Mock, 작업 상태, 검증, 멱등성, 오류 변환과 결과 저장은 구현 범위다.

## 2. 업무 처리 순서

### 2.1 책임 분리

- AI는 `suggestedPriority`, 근거와 `confidence`를 제안한다.
- 간호사는 제안을 수락하거나 수정해 `confirmedPriority`를 확정하거나 기존 확정을 해제할 수 있다.
- Node.js는 검증 가능한 시간과 상태만 사용해 `rulePriority`와 실제 정렬을 결정한다.
- 숫자형 AI score는 schema, DTO, fixture, 응답과 정렬에 사용하지 않는다.
- `effectivePriority`는 `confirmedPriority ?? rulePriority`다. AI 제안은 간호사가 확정하기 전까지 표시 정보이며 실제 정렬에 직접 사용하지 않는다.

이 priority enum은 환자의 임상 위험도나 진단이 아니라 간호사가 수행할 **업무 처리 긴급도**를 뜻한다. AI는 저장된 Timeline event 또는 Task 근거 ID에 연결된 제안만 반환하며 새로운 진단이나 환자 위험도를 확정하지 않는다. 간호사가 확정하지 않은 AI 이유는 실제 정렬 근거로 표시하지 않는다.

AI 제안, Node.js 규칙값과 간호사 확정값은 서로 다른 필드로 보존한다. 제안 수락, 수동 변경과 확정 해제는 append-only 감사 기록으로 남긴다.

### 2.2 Node.js 규칙

`TODO` 또는 `IN_PROGRESS` 업무의 규칙 우선순위는 요청의 검증된 demo session에서 확인한 현재 근무와 서버 Clock을 기준으로 계산한다.

1. `dueAt < now`이면 `CRITICAL`이다.
2. 마감이 지나지 않았고 `dueAt <= currentDutyEndsAt`이면 `HIGH`다.
3. 그 외와 마감이 없는 업무는 `NORMAL`이다.

현재 근무를 유일하게 결정할 수 없으면 임의 시간을 사용하지 않고 요청을 도메인 오류로 거부한다. 동일한 `effectivePriority`에서는 `dueAt ASC NULLS LAST`, `createdAt ASC`, `id ASC` 순으로 안정 정렬한다.

### 2.3 업무 추출 경계

Rounding 구현 전에는 `TaskExtractionEvidencePort`와 deterministic Mock으로 근거 조회와 orchestration을 완성한다. 실제 Rounding repository 또는 Prisma model을 Task 모듈이 직접 참조하지 않으며, Rounding 구현 후 같은 Port의 Adapter를 통합 작업에서 연결한다.

업무 후보 추출과 우선순위 제안은 하나의 extraction job 결과로 원자적으로 저장한다. AI 제안은 후보 화면에 제공하지만, 선택 반영 시 간호사가 수락하거나 수정한 값만 `confirmedPriority`가 된다.

## 3. 내부 AI 연동 경계

Python FastAPI에서 생성한 OpenAPI artifact가 제공되기 전에는 실제 HTTP header, status와 request·response DTO를 추측하지 않는다. Task와 Handoff는 application Port와 deterministic Mock으로 전체 상태 흐름, timeout, 잘못된 응답과 실패 변환을 먼저 구현한다.

실제 HTTP Adapter와 runtime contract test는 Python FastAPI OpenAPI artifact를 받은 후 별도 통합 변경으로 추가한다. 내부 AI 경로는 Node.js가 제공하는 Controller가 아니라 Python 서비스를 호출하는 outbound 계약이다.

## 4. 인수인계 사전검증과 초안

- 사전검증 질문은 AI 제안 원문, severity, 근거 Timeline event 또는 Task ID와 사용자 답변을 분리해 저장한다.
- severity는 `CRITICAL`과 `RECOMMENDED`로 구분한다.
- 사용자 답변은 `NO_ISSUE`, `INCLUDE_HANDOFF`, `UNVERIFIED`, `NOT_APPLICABLE`만 허용한다.
- 초안 생성 입력에는 사용한 질문·답변과 근거 snapshot을 포함한다. 초안 생성 이후 그 초안이 참조한 사전검증 답변은 변경하지 않는다.
- SBAR template API가 별도로 없으므로 MVP에서는 서버 allowlist의 `SBAR_DEFAULT_V1`만 허용한다.
- AI 원문 초안, 간호사의 현재 수정본, section별 citation과 수정 여부를 구분해 보존한다.
- Handoff는 `TimelineReader`와 `TaskQueryPort`만 사용하며 Timeline·Task repository 또는 Prisma model을 직접 참조하지 않는다.

## 5. 발신 근무와 수신자 결정

- 요청의 `shiftId`가 현재 demo session의 dataset, ward와 actor에게 속한 유효한 발신 근무인지 검증한다.
- 서버는 `date`와 `targetDuty`로 같은 dataset과 ward의 수신 근무자를 유일하게 결정한다.
- 수신 근무자가 없으면 `404`, 둘 이상이면 임의 선택하지 않고 `409` 도메인 오류로 거부한다.
- 발신 간호사만 사전검증, 답변, 초안 수정과 최종 확정을 수행한다.
- 저장된 발신 간호사와 수신 간호사는 finalized handoff를 열람할 수 있다. 질문 또는 수신 확인은 저장된 수신 간호사만 기록할 수 있다.

## 6. 인수인계 최종 확정

최종 확정 가능 여부는 요청 본문의 선언이 아니라 DB에 저장된 현재 상태와 human answer로 Node.js가 판단한다.

### 6.1 공통 조건

- Handoff 상태가 `DRAFT`이고 초안 생성 job이 성공해야 한다.
- 요청 `version`이 현재 draft version과 일치해야 한다.
- `CRITICAL` 항목은 모두 human answer가 저장돼 있어야 한다. `CRITICAL` 미응답은 경고 확정으로 우회할 수 없으며 `422`로 거부한다.
- finalize는 `X-Idempotency-Key`와 canonical request hash를 사용한다.

### 6.2 `RESOLVED`와 `KEEP_WITH_WARNING`

- `RESOLVED`는 모든 항목에 human answer가 있고 저장된 답변 중 `UNVERIFIED`가 없을 때만 허용한다.
- 요청 body가 `RESOLVED`라고 선언해도 서버 조건을 만족하지 않으면 거부한다.
- `RECOMMENDED` 미응답 또는 `UNVERIFIED` 답변이 하나라도 있으면 `KEEP_WITH_WARNING`을 명시해야 확정할 수 있다.
- 실제 경고 대상이 없는데 `KEEP_WITH_WARNING`을 요청하면 `422`로 거부한다.
- `KEEP_WITH_WARNING` 선택, actor, 시각과 미응답·`UNVERIFIED` 항목은 final snapshot과 감사 이력에 보존한다.

### 6.3 불변 snapshot과 수신 기록

finalize transaction은 현재 초안, AI 원문, 사용자 수정본, citation, 질문·답변, warning과 연결 업무 read model을 final snapshot으로 복사하고 Handoff를 `FINALIZED`로 전이한다. finalized snapshot은 수정하거나 재생성하지 않는다.

수신자의 최초 열람, 질문과 `ACKNOWLEDGED` 기록은 append-only 이력으로 추가한다. 이 기록은 finalized 원본 상태나 snapshot을 변경하지 않으며, 목록의 수신 상태는 별도 projection으로 계산한다.

## 7. 결과 보관과 `410`

Task extraction과 Handoff precheck의 자동 만료 기간은 정해져 있지 않다. MVP에서는 해당 결과를 demo dataset 수명 동안 보존하고 자동 삭제 또는 `410 Gone` 응답을 구현하지 않는다.

향후 보관기간을 도입하려면 삭제 대상, 사용자 재처리 흐름과 감사 보존 범위를 별도 결정 문서와 OpenAPI 변경에서 함께 확정한다. 임의의 24시간 또는 7일 정책을 구현하지 않는다.

## 8. 병렬 구현 경계

Task와 Handoff feature branch는 `docs/decisions/domain-foundation-parallel-ownership.md`의 전담 경로만 수정한다. 공통 module 등록, Prisma migration, cross-domain FK, 생성 OpenAPI와 전체 PostgreSQL E2E는 두 feature 결과를 검토한 후 통합 Issue에서 한 번만 처리한다.
