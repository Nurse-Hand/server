# MVP 구현 범위

## 1. 목적과 기준

이 문서는 Nurse Hand 서버 MVP에서 구현하거나 제외할 기능의 범위를 고정한다. Notion과 로컬 export는 사용자 흐름과 초기 요구사항을 이해하기 위한 참고 자료이며, 구현 범위에 대한 저장소 내 기준은 이 문서다.

- 원본 목록: Notion export의 `Nurse Hand API 명세` 43개 항목
- 공개 API의 정확한 요청·응답 계약: NestJS Controller와 DTO에서 생성한 OpenAPI
- 내부 AI API의 정확한 요청·응답 계약: Python FastAPI에서 생성한 OpenAPI
- 비즈니스 규칙: 이 문서와 관련 결정 문서 및 테스트
- 업무·인수인계 상세 정책: `docs/decisions/task-handoff-policy.md`
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

### 2.1 Notion 43개 외 서버 지원 API

Notion의 기능 API를 대체하지 않으면서 데모 실행과 파일·라운딩 resource 연결에 필요한 공개 API는 별도 지원 API로 관리한다. 지원 API를 추가·삭제할 때도 Controller·DTO·OpenAPI·테스트와 아래 표를 같은 변경에서 갱신한다.

| Method | Endpoint | 목적 | 기존 기능과의 경계 |
|---|---|---|---|
| `POST` | `/api/v1/demo-sessions` | 인증 제외 기간의 검증된 synthetic context 생성 | 인증 5개를 구현한 것으로 계산하지 않음 |
| `POST` | `/api/v1/rounding-sessions/{sessionId}/patient-segments` | 한 라운딩 안의 현재 환자 구간 전환 기록 | 라운딩 세션 시작·종료·조회 API를 대체하지 않음 |
| `POST` | `/api/v1/files/audio` | 빠른 기록 등 단일 오디오 파일 저장 | 장시간 라운딩의 `audio-chunks` API를 대체하지 않음 |
| `POST` | `/api/v1/files/photos` | 사진 파일 저장 | 파일 ID를 실제 라운딩·빠른 기록 resource에 연결해야 함 |
| `POST` | `/api/v1/quick-notes` | 활성 라운딩 밖에서 환자를 선택해 빠른 기록 생성 | 세션 안의 `/rounding-sessions/{sessionId}/records`를 대체하지 않음 |
| `POST` | `/api/v1/task-priority-suggestions` | 수동 업무의 명시적 AI 우선순위 참고 제안 batch 생성 | Notion 업무 API 6개와 내부 `/internal/v1/tasks/prioritize`를 대체하지 않음 |

지원 파일은 demo session scope를 검증하고, 연결되지 않은 orphan의 정리 정책을 파일 저장 Issue에서 고정해야 한다. 파일 업로드 성공만으로 라운딩 기록이나 빠른 기록이 생성된 것으로 취급하지 않는다.

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

가비아 단일 서버 데모에서는 사진과 음성을 서버 로컬 디스크에 저장하고 DB에는 검증된 metadata와 비공개 storage URI만 둔다. 파일 저장 구현은 교체 가능한 Port/Adapter 뒤에 두되 S3 연동은 MVP 범위에서 제외한다. 저장소 선택과 무관하게 음성 업로드 API 자체는 범위에서 제외하지 않는다.

파일 저장 모듈은 domain API와 위 지원 API가 함께 사용하는 내부 capability다. Notion 전수표의 `/rounding-sessions/{sessionId}/audio-chunks`, 라운딩 기록과 빠른 기록 endpoint가 파일 소유 resource와 접근 범위를 검증한 뒤 저장 Port를 호출한다. 지원 API가 반환한 파일 ID도 최종 domain resource에 연결될 때 같은 scope를 다시 검증한다.

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

위 6개는 Notion 43개 전수표의 업무 API다. 명시적 AI 제안 batch용 `POST /api/v1/task-priority-suggestions`는 2.1의 서버 지원 API로 별도 관리하므로 43개 합계와 업무 6개 개수에는 포함하지 않는다.

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
| 40 | `POST` | `/internal/v1/tasks/prioritize` | 업무 우선순위 제안 | P0 | 우선순위·근거·score 제안과 FastAPI 계약 제공 | 규칙 우선순위 계산, 제안 저장, 사용자 확정 반영 | 연동 구현 |
| 41 | `POST` | `/internal/v1/tasks/extract` | 업무 후보 추출 | P0 | 후보·근거·신뢰도 추론과 FastAPI 계약 제공 | 작업 오케스트레이션, 후보 저장, 선택 반영 | 연동 구현 |
| 42 | `POST` | `/internal/v1/handoffs/precheck` | 인수인계 누락 검증 | P0 | 근거 기반 역질문 생성과 FastAPI 계약 제공 | 입력 구성, 결과 저장, 답변과 상태 관리 | 연동 구현 |
| 43 | `POST` | `/internal/v1/handoffs/generate` | 인수인계 초안 생성 | P0 | 근거가 연결된 6개 임상 section 초안 생성과 FastAPI 계약 제공 | 생성 요청, 초안·근거 저장, 수정·확정 관리 | 연동 구현 |

Python 모델 코드는 이 저장소에서 구현하지 않는다. 그렇더라도 Node.js의 Adapter, Mock, 요청·응답 검증, timeout, 오류 변환, 멱등성, 작업 상태 관리는 서버 구현 범위다.

## 4. 업무 우선순위 결정

업무 우선순위는 AI, Node.js 규칙, 간호사의 역할을 분리한다.

1. 명시적 우선순위 batch에서 AI는 `suggestedPriority`, 제안 근거, 같은 batch 표시용 `score`를 반환한다. 이는 자동 확정값이 아니다. 업무 추출 후보의 별도 계약만 `confidence`를 유지한다.
2. Node.js는 마감 상태와 `dueAt`처럼 검증 가능한 구조화 데이터로 재현 가능한 `rulePriority`와 정렬 키를 계산한다. 이월 여부는 MVP 규칙의 입력으로 사용하지 않는다.
3. 간호사는 AI 제안을 수락하거나 수정해 `confirmedPriority`를 확정할 수 있다.
4. 표시와 정렬에는 간호사 확정값을 먼저 사용하고, 확정값이 없으면 Node.js 규칙을 사용한다.
5. 동일한 우선순위에서는 `dueAt`, `createdAt`, ID 순서로 안정 정렬한다.

개념상 저장 값은 다음 책임을 구분해야 한다. 최종 필드명과 enum은 공개·내부 OpenAPI에서 확정한다.

- 명시적 우선순위 batch의 `aiSuggestedPriority`, `aiReasons`, `aiScore`: 현재 AI 제안과 같은 batch 표시 순서
- 업무 추출 후보의 `aiSuggestedPriority`, `aiReasons`, `aiConfidence`: 기존 추출 계약의 제안과 근거
- `rulePriority`: Node.js가 계산한 결정론적 값
- `confirmedPriority`: 간호사가 수락 또는 수정한 값
- `effectivePriority`: 조회 시 적용되는 최종 값

숫자형 AI score는 명시적으로 생성한 같은 batch의 참고 제안 표시 순서에만 저장·노출하며, 실제 Task 정렬·자동 확정·임상 위험도에는 사용하지 않는다. AI 제안 수락은 별도 사용자 행동으로 감사 이력에 남긴다. 정확한 Node.js 규칙과 AI·간호사 간 결정 경계는 `docs/decisions/task-handoff-policy.md`를 따른다.

화면의 선택형 긴급도는 `priorityOverride`, 시간 조건은 `dueAt`으로 기존 계약에 매핑한다. AI `score`는 같은 batch의 참고 제안 순서 외에는 비교하지 않고 별도 `priorityScore` 입력이나 Task 정렬 필드를 추가하지 않는다.

## 5. 인수인계 공통 정책

- 사전검증과 초안 생성 결과에는 근거가 된 Timeline 이벤트 또는 업무 ID를 연결한다.
- AI가 생성한 질문과 경고는 원문 사실과 구분해 저장한다.
- MVP template은 `NURSING_HANDOFF_V1`이고 환자별 초안은 `PATIENT_STATUS`, `PAIN`, `TREATMENT`, `DIET`, `ACTIVITY`, `OBSERVATION` 6개 section을 가진다.
- Evidence의 세부 topic과 인수인계 표시 section은 별도 필드로 보존한다. 활력징후·호흡·의식상태 topic은 `PATIENT_STATUS`로 매핑한다.
- citation은 source 식별자뿐 아니라 시각과 표시 텍스트를 제공한다. 실제 발화, summary, 업무 제목을 구분하고 summary를 원문으로 표시하지 않는다.
- 역질문이 해결되었다는 상태는 요청 본문만 신뢰하지 않고, 서버에 저장된 답변과 검증 결과로 판단한다.
- 최종 확정 전 필수 항목, version 충돌, 이미 확정된 문서 여부를 서버가 검사한다.
- 최종 확정 시 현재 초안, 근거, 질문·답변, 경고를 변경 불가능한 snapshot으로 저장한다.
- 수신 확인과 변경·열람 이력은 최종 확정과 별도 기록으로 보존한다.
- AI 경고를 확정 차단 조건으로 사용할지는 결정론적 서버 규칙과 분리한다. 경고를 허용하는 경우 사용자의 명시적 확인과 감사 이력을 남긴다.

역질문 답변과 경고를 최종 확정에 반영하는 정확한 규칙, snapshot과 수신 이력의 경계는 `docs/decisions/task-handoff-policy.md`를 따른다.

전체 transcript와 화자 후보·수정은 #17, Evidence 저장·검색과 Timeline 원문 역추적은 #18, 빠른 기록 입력은 #19, 로컬 파일 저장 Port/Adapter는 #14가 소유한다. Handoff는 이 결과를 Port로 읽고 해당 기능을 중복 구현하지 않는다. 근무표 Calendar CRUD와 OCR은 이 문서의 근무표 API 4개 범위에서 후속 구현한다.

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

- Notion 기준 인증 외 공개 API 33개가 NestJS Controller와 DTO, 서비스, 저장 계층, 테스트에 구현되어 있다. 2.1의 지원 API는 이 33개에 포함하지 않으며 표에 등록된 항목만 추가로 노출한다.
- 5개 내부 AI API 각각에 FastAPI OpenAPI와 일치하는 Node.js Adapter가 있다.
- 인증 5개만 명시적으로 제외되어 있으며 다른 P1 기능이 누락되지 않는다.
- 공개 OpenAPI가 NestJS 코드에서 재생성되고 저장소의 생성 결과와 일치한다.
- 내부 AI OpenAPI가 Python 팀의 FastAPI 생성 결과와 일치한다.
- Task의 AI 제안, Node.js 규칙, 간호사 확정 값이 섞이지 않고 추적된다.
- Handoff 10개 기능과 최종본 불변성, version 충돌, 감사 이력이 테스트된다.
- 실제 환자 데이터, 원본 음성, 토큰 또는 기타 비밀값이 코드·fixture·문서·로그에 포함되지 않는다.
