# MVP 구현 범위

## 1. 목적과 기준

이 문서는 Nurse Hand 서버 MVP에서 구현하거나 제외할 기능의 범위를 고정한다. Notion과 로컬 export는 사용자 흐름과 초기 요구사항을 이해하기 위한 참고 자료이며, 구현 범위에 대한 저장소 내 기준은 이 문서다.

- 원본 목록: Notion export의 `Nurse Hand API 명세` 43개 항목
- 공개 API의 정확한 요청·응답 계약: NestJS Controller와 DTO에서 생성한 OpenAPI
- 내부 AI API의 정확한 요청·응답 계약: Python FastAPI에서 생성한 OpenAPI
- 비즈니스 규칙: 이 문서와 관련 결정 문서 및 테스트
- P0/P1은 구현 순서를 뜻하며, `MVP 제외`라고 명시하지 않은 P1 API도 구현 대상이다.
- API 개수나 소유권을 변경할 때는 이 문서, OpenAPI, 테스트를 같은 변경에서 갱신한다.

## 2. 범위 요약

| 구분 | 개수 | 구현 결정 | 소유권 |
|---|---:|---|---|
| 인증 공개 API | 5 | MVP 제외 | 후속 Node.js 서버 작업 |
| 인증 외 공개 API | 33 | 전부 구현 | Node.js 서버 |
| 내부 AI API | 5 | 전부 연동 | Python AI가 추론 API 제공, Node.js가 Adapter와 작업 오케스트레이션 구현 |
| 합계 | 43 | 38개 API 구현·연동, 인증 5개 제외 | 아래 전수 목록 참조 |

인증을 제외하는 동안 actor와 병동 범위를 임의 body 값으로 받지 않도록 `POST /api/v1/demo-sessions`를 서버 지원 API로 추가한다. 이 API는 Notion export의 43개에는 포함하지 않으며 로그인·회원가입을 대신하는 실제 인증 기능으로 취급하지 않는다. 첫 업무 API를 구현하기 전에 synthetic 사용자·병동·환자 배정과 함께 제공해야 한다.

## 3. 43개 API 전수 매핑

### 3.1 인증 — 5개, MVP 제외

| # | Method | Endpoint | 기능 | 우선순위 | 소유권 | 구현 여부 |
|---:|---|---|---|---|---|---|
| 1 | `POST` | `/api/v1/auth/token/refresh` | Access Token 재발급 | P0 | Node.js | MVP 제외 |
| 2 | `POST` | `/api/v1/auth/password-reset/request` | 비밀번호 재설정 요청 | P1 | Node.js | MVP 제외 |
| 3 | `POST` | `/api/v1/auth/logout` | 로그아웃 | P1 | Node.js | MVP 제외 |
| 4 | `POST` | `/api/v1/auth/login` | 로그인 | P0 | Node.js | MVP 제외 |
| 5 | `POST` | `/api/v1/auth/register` | 회원가입 | P1 | Node.js | MVP 제외 |

### 3.2 근무표 — 4개, Node.js 구현

| # | Method | Endpoint | 기능 | 우선순위 | 소유권 | 구현 여부 |
|---:|---|---|---|---|---|---|
| 6 | `POST` | `/api/v1/schedule-ocr-jobs` | 근무표 OCR 작업 생성 | P1 | Node.js, OCR은 AI Adapter 연동 | 구현 |
| 7 | `GET` | `/api/v1/schedule-ocr-jobs/{jobId}` | 근무표 OCR 결과 조회 | P1 | Node.js | 구현 |
| 8 | `PUT` | `/api/v1/me/schedules/{yearMonth}` | 근무표 저장·수정 | P1 | Node.js | 구현 |
| 9 | `GET` | `/api/v1/me/schedules/{yearMonth}` | 내 근무표 조회 | P1 | Node.js | 구현 |

### 3.3 라운딩 — 6개, Node.js 구현

| # | Method | Endpoint | 기능 | 우선순위 | 소유권 | 구현 여부 |
|---:|---|---|---|---|---|---|
| 10 | `POST` | `/api/v1/rounding-sessions/{sessionId}/complete` | 라운딩 세션 종료 | P0 | Node.js | 구현 |
| 11 | `GET` | `/api/v1/rounding-sessions/{sessionId}` | 라운딩 세션 상태 조회 | P0 | Node.js | 구현 |
| 12 | `POST` | `/api/v1/rounding-sessions` | 라운딩 세션 시작 | P0 | Node.js | 구현 |
| 13 | `GET` | `/api/v1/rounding-records` | 오늘 라운딩 기록 조회 | P0 | Node.js | 구현 |
| 14 | `POST` | `/api/v1/rounding-sessions/{sessionId}/records` | 빠른 기록 생성 | P1 | Node.js | 구현 |
| 15 | `POST` | `/api/v1/rounding-sessions/{sessionId}/audio-chunks` | 음성 청크 업로드 | P0 | Node.js, 분석은 AI Adapter 연동 | 구현 |

업로드 저장소가 필요한 경우 Local/S3 호환 Adapter 같은 구현 세부사항은 라운딩 Issue에서 결정한다. 저장소 제품이 미정이라는 이유로 음성 업로드 API 자체를 범위에서 제외하지 않는다.

### 3.4 환자 Timeline — 7개, Node.js 구현

| # | Method | Endpoint | 기능 | 우선순위 | 소유권 | 구현 여부 |
|---:|---|---|---|---|---|---|
| 16 | `POST` | `/api/v1/patient-insights/{insightId}/actions` | AI 인사이트 처리 | P0 | Node.js | 구현 |
| 17 | `GET` | `/api/v1/patients/{patientId}/timeline` | 환자 Timeline 조회 | P0 | Node.js | 구현 |
| 18 | `PATCH` | `/api/v1/rounding-records/{recordId}/patient` | 기록 환자 매칭 수정 | P0 | Node.js | 구현 |
| 19 | `GET` | `/api/v1/patients` | 담당 환자 목록 조회 | P0 | Node.js | 구현 |
| 20 | `PATCH` | `/api/v1/timeline-events/{eventId}` | Timeline 이벤트 수정 | P1 | Node.js | 구현 |
| 21 | `GET` | `/api/v1/patients/{patientId}` | 환자 상세 조회 | P0 | Node.js | 구현 |
| 22 | `GET` | `/api/v1/timeline-events/{eventId}/history` | Timeline 이벤트 변경 이력 조회 | P1 | Node.js | 구현 |

### 3.5 업무 — 6개, Node.js 구현

| # | Method | Endpoint | 기능 | 우선순위 | 소유권 | 구현 여부 |
|---:|---|---|---|---|---|---|
| 23 | `GET` | `/api/v1/tasks` | 업무 목록 조회 | P0 | Node.js | 구현 |
| 24 | `POST` | `/api/v1/tasks` | 업무 직접 생성 | P0 | Node.js | 구현 |
| 25 | `POST` | `/api/v1/task-extraction-jobs` | 업무 추출 작업 생성 | P0 | Node.js, AI Adapter 연동 | 구현 |
| 26 | `GET` | `/api/v1/task-extraction-jobs/{jobId}` | 업무 추출 결과 조회 | P0 | Node.js | 구현 |
| 27 | `PATCH` | `/api/v1/tasks/{taskId}` | 업무 수정·상태 변경 | P0 | Node.js | 구현 |
| 28 | `POST` | `/api/v1/task-extraction-jobs/{jobId}/apply` | 추출 업무 선택 반영 | P0 | Node.js | 구현 |

### 3.6 인수인계 — 10개, Node.js 전부 구현

| # | Method | Endpoint | 기능 | 우선순위 | 소유권 | 구현 여부 |
|---:|---|---|---|---|---|---|
| 29 | `POST` | `/api/v1/handoffs/{handoffId}/finalize` | 인수인계 최종 확정 | P0 | Node.js | 구현 |
| 30 | `PATCH` | `/api/v1/handoffs/{handoffId}` | 인수인계 초안 수정 | P0 | Node.js | 구현 |
| 31 | `GET` | `/api/v1/handoffs/{handoffId}/history` | 인수인계 변경·열람 이력 조회 | P1 | Node.js | 구현 |
| 32 | `GET` | `/api/v1/handoff-prechecks/{precheckId}` | 인수인계 사전검증 결과 조회 | P0 | Node.js | 구현 |
| 33 | `GET` | `/api/v1/handoffs` | 인수인계 목록 조회 | P0 | Node.js | 구현 |
| 34 | `PATCH` | `/api/v1/handoff-prechecks/{precheckId}/items/{itemId}` | 역질문 응답 저장 | P0 | Node.js | 구현 |
| 35 | `GET` | `/api/v1/handoffs/{handoffId}` | 인수인계 상세 조회 | P0 | Node.js | 구현 |
| 36 | `POST` | `/api/v1/handoffs` | 인수인계 초안 생성 | P0 | Node.js, AI Adapter 연동 | 구현 |
| 37 | `POST` | `/api/v1/handoffs/{handoffId}/acknowledgements` | 인수인계 수신 확인 | P1 | Node.js | 구현 |
| 38 | `POST` | `/api/v1/handoff-prechecks` | 인수인계 사전검증 생성 | P0 | Node.js, AI Adapter 연동 | 구현 |

인수인계 목록, 사전검증 생성, 결과 조회, 역질문 응답, 초안 생성, 상세 조회, 초안 수정, 최종 확정, 수신 확인, 변경·열람 이력의 10개 기능을 모두 구현한다. P1인 수신 확인과 이력 조회도 생략하지 않는다.

### 3.7 내부 AI — 5개, Python 제공 및 Node.js 연동

| # | Method | Endpoint | 기능 | 우선순위 | Python AI 책임 | Node.js 책임 | 구현 여부 |
|---:|---|---|---|---|---|---|---|
| 39 | `POST` | `/internal/v1/audio/analyze` | 음성 분석 | P0 | STT·화자 분리·구조화 추론과 FastAPI 계약 제공 | 입력 준비, 호출, timeout, 작업 상태와 결과 저장 | 연동 구현 |
| 40 | `POST` | `/internal/v1/tasks/prioritize` | 업무 우선순위 제안 | P0 | 우선순위·근거·신뢰도 제안과 FastAPI 계약 제공 | 규칙 우선순위 계산, 제안 저장, 사용자 확정 반영 | 연동 구현 |
| 41 | `POST` | `/internal/v1/tasks/extract` | 업무 후보 추출 | P0 | 후보·근거·신뢰도 추론과 FastAPI 계약 제공 | 작업 오케스트레이션, 후보 저장, 선택 반영 | 연동 구현 |
| 42 | `POST` | `/internal/v1/handoffs/precheck` | 인수인계 누락 검증 | P0 | 근거 기반 역질문 생성과 FastAPI 계약 제공 | 입력 구성, 결과 저장, 답변과 상태 관리 | 연동 구현 |
| 43 | `POST` | `/internal/v1/handoffs/generate` | 인수인계 초안 생성 | P0 | 근거가 연결된 SBAR 초안 생성과 FastAPI 계약 제공 | 생성 요청, 초안·근거 저장, 수정·확정 관리 | 연동 구현 |

Python 모델 코드는 이 저장소에서 구현하지 않는다. 그렇더라도 Node.js의 Adapter, Mock, 요청·응답 검증, timeout, 오류 변환, 멱등성, 작업 상태 관리는 서버 구현 범위다.

## 4. 업무 우선순위 결정

업무 우선순위는 AI, Node.js 규칙, 간호사의 역할을 분리한다.

1. AI는 `suggestedPriority`, 제안 근거, 신뢰도를 반환한다. 이는 자동 확정값이 아니다.
2. Node.js는 마감 상태, `dueAt`, 이월 여부처럼 검증 가능한 구조화 데이터로 재현 가능한 `rulePriority`와 정렬 키를 계산한다.
3. 간호사는 AI 제안을 수락하거나 수정해 `confirmedPriority`를 확정할 수 있다.
4. 표시와 정렬에는 간호사 확정값을 먼저 사용하고, 확정값이 없으면 Node.js 규칙을 사용한다.
5. 동일한 우선순위에서는 `dueAt`, `createdAt`, ID 순서로 안정 정렬한다.

개념상 저장 값은 다음 책임을 구분해야 한다. 최종 필드명과 enum은 공개·내부 OpenAPI에서 확정한다.

- `aiSuggestedPriority`, `aiReason`, `aiConfidence`: AI 제안과 근거
- `rulePriority`: Node.js가 계산한 결정론적 값
- `confirmedPriority`: 간호사가 수락 또는 수정한 값
- `effectivePriority`: 조회 시 적용되는 최종 값

AI가 반환하는 숫자 점수는 모델 분석 정보로 보관할 수 있지만 그 자체로 최종 정렬이나 임상 결정을 확정하지 않는다. AI 제안 수락은 별도 사용자 행동으로 감사 이력에 남긴다.

## 5. 인수인계 공통 정책

- 사전검증과 초안 생성 결과에는 근거가 된 Timeline 이벤트 또는 업무 ID를 연결한다.
- AI가 생성한 질문과 경고는 원문 사실과 구분해 저장한다.
- 역질문이 해결되었다는 상태는 요청 본문만 신뢰하지 않고, 서버에 저장된 답변과 검증 결과로 판단한다.
- 최종 확정 전 필수 항목, version 충돌, 이미 확정된 문서 여부를 서버가 검사한다.
- 최종 확정 시 현재 초안, 근거, 질문·답변, 경고를 변경 불가능한 snapshot으로 저장한다.
- 수신 확인과 변경·열람 이력은 최종 확정과 별도 기록으로 보존한다.
- AI 경고를 확정 차단 조건으로 사용할지는 결정론적 서버 규칙과 분리한다. 경고를 허용하는 경우 사용자의 명시적 확인과 감사 이력을 남긴다.

## 6. 구현 단계

단계는 병렬 개발을 안전하게 나누기 위한 순서이며 범위 삭제를 의미하지 않는다.

1. 서버 Runtime Foundation: NestJS, Prisma/PostgreSQL 연결 기반, 공통 응답·오류·검증, Health, OpenAPI, CI
2. 공유 Domain Foundation: demo session과 synthetic 배정, 최소 Patient/Timeline schema, 공통 작업 상태, AI Port, `TimelineReader`, `TaskQueryPort`
3. 업무·인수인계: 업무 6개와 인수인계 10개 전부
4. 환자·라운딩: 환자 Timeline 7개와 라운딩 6개 전부
5. 근무표·실제 AI 통합: 근무표 4개와 Python 내부 AI 5개 Adapter의 contract test
6. 전체 통합 검증: 43개 전수표와 OpenAPI 구현 상태 대조

Task와 Handoff는 공유 Domain Foundation까지 `dev`에 병합된 뒤 각각의 모듈과 테스트 경로에서 병렬 구현할 수 있다. Prisma schema, 공통 응답, OpenAPI bootstrap, 전역 Module 같은 공유 파일은 통합 작업에서 관리한다.

## 7. 완료 기준

- 33개 공개 API가 NestJS Controller와 DTO, 서비스, 저장 계층, 테스트에 구현되어 있다.
- 5개 내부 AI API 각각에 FastAPI OpenAPI와 일치하는 Node.js Adapter가 있다.
- 인증 5개만 명시적으로 제외되어 있으며 다른 P1 기능이 누락되지 않는다.
- 공개 OpenAPI가 NestJS 코드에서 재생성되고 저장소의 생성 결과와 일치한다.
- 내부 AI OpenAPI가 Python 팀의 FastAPI 생성 결과와 일치한다.
- Task의 AI 제안, Node.js 규칙, 간호사 확정 값이 섞이지 않고 추적된다.
- Handoff 10개 기능과 최종본 불변성, version 충돌, 감사 이력이 테스트된다.
- 실제 환자 데이터, 원본 음성, 토큰 또는 기타 비밀값이 코드·fixture·문서·로그에 포함되지 않는다.
