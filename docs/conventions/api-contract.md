# API 계약 관리 규칙

## 1. 계약의 기준

API 계약은 대상별로 작성 원본을 하나만 둔다.

| 대상 | 작성 원본 | 생성·보관 결과 | 직접 수정 |
|---|---|---|---|
| Mobile → Node.js 공개 API | NestJS Controller, 요청·응답 DTO, Swagger decorator | `openapi/public.json` | 생성 JSON 수정 금지 |
| Node.js → Python 내부 AI API | Python FastAPI route와 Pydantic model | `openapi/internal-ai.json` | 생성 JSON 수정 금지 |
| 기능 범위와 소유권 | `docs/decisions/mvp-scope.md` | 같은 문서 | 리뷰를 거쳐 수정 |
| 세부 비즈니스 규칙 | 결정 문서와 자동화 테스트 | 코드·테스트 | OpenAPI에만 숨겨 두지 않음 |

Notion과 export는 요구사항의 배경과 화면 흐름을 확인하는 참고 자료다. 요청 필드, 응답 필드, 상태 코드가 충돌하면 구현 전에 위 작성 원본과 범위 문서를 갱신해 하나의 계약으로 수렴한다.

저장 Port를 구현했다는 이유만으로 범용 공개 upload endpoint를 임의로 추가하지 않는다. 기존 domain endpoint와 별도 공개 API가 필요하면 `docs/decisions/mvp-scope.md`의 지원 API 표와 resource 소유권을 먼저 갱신하고, 해당 Controller·DTO에서 OpenAPI를 생성한다.

## 2. 공개 API 생성 흐름

공개 API는 NestJS 코드에서 OpenAPI를 생성한다.

```text
Controller + DTO + Swagger decorator
               ↓
       openapi:generate
               ↓
       openapi/public.json
               ↓
       openapi:check + CI diff 검사
```

- 요청 DTO와 응답 DTO를 분리하고 Prisma model을 응답 스키마로 직접 사용하지 않는다.
- 모든 body, path, query, header 입력에 타입과 필수 여부, validation 제약을 선언한다.
- 모든 성공·실패 상태 코드를 Controller 문서와 테스트에 함께 등록한다.
- `openapi/public.json`은 생성 명령으로만 바꾼다. 포맷 수정도 생성 설정에서 해결한다.
- `npm run openapi:generate`와 `npm run openapi:check`를 Foundation의 표준 script로 제공한다.
- CI의 `openapi:check`는 임시 위치에 다시 생성한 결과와 커밋된 결과가 다른 경우 실패해야 한다.

## 3. 내부 AI 계약 동기화

내부 AI API의 작성 원본은 Python 서비스의 FastAPI OpenAPI다.

```text
FastAPI route + Pydantic model
               ↓
        FastAPI /openapi.json
               ↓
     검토된 artifact 동기화
               ↓
      openapi/internal-ai.json
               ↓
Node Adapter 요청·응답 runtime validation
```

- Python 팀은 5개 내부 API의 FastAPI OpenAPI artifact와 변경 내역을 제공한다.
- Node.js 팀은 해당 artifact를 기준으로 client type과 runtime validator를 생성하거나 작성한다.
- `openapi/internal-ai.json`을 Node.js 요구사항에 맞게 직접 고치지 않는다. 필요한 변경은 Python 작성 원본에서 먼저 합의하고 다시 생성한다.
- 실제 Python 서비스가 준비되기 전에는 Mock Adapter로 개발할 수 있다. Mock은 동일한 Port를 구현하고 계약 fixture를 사용하되, 실제 FastAPI OpenAPI와의 contract test 전에는 연동 완료로 표시하지 않는다.
- 내부 응답을 Node 공개 응답 envelope로 추측해 감싸지 않는다. FastAPI OpenAPI에 선언된 구조 그대로 검증한 뒤 application model로 변환한다.

내부 AI의 기본 대상은 다음 5개다.

| Method | Endpoint | Node Port 책임 |
|---|---|---|
| `POST` | `/internal/v1/audio/analyze` | 음성 분석 요청과 결과 변환 |
| `POST` | `/internal/v1/tasks/prioritize` | AI 우선순위 제안과 근거 변환 |
| `POST` | `/internal/v1/tasks/extract` | 업무 후보와 근거 변환 |
| `POST` | `/internal/v1/handoffs/precheck` | 누락 검증 질문과 근거 변환 |
| `POST` | `/internal/v1/handoffs/generate` | 6개 임상 section 초안과 citation 변환 |

업무 우선순위 batch 응답은 `suggestionId`, `aiSuggestedPriority`, 근거와 `aiScore`를 제공한다. `aiScore`는 같은 `tasks-prioritize-v1` batch의 표시 순서에만 사용하고 실제 Task 정렬·자동 확정·임상 위험도로 해석하지 않는다. 인수인계 생성 응답은 `NURSING_HANDOFF_V1`의 `PATIENT_STATUS`, `PAIN`, `TREATMENT`, `DIET`, `ACTIVITY`, `OBSERVATION` section을 사용한다.

인수인계 공개 citation은 source 식별자와 함께 nullable `occurredAt`, `excerptKind`, `excerpt`를 제공한다. Timeline citation은 event 발생 시각을 사용하고 `TASK_TITLE`은 `occurredAt=null`이며 업무 마감은 linked task의 `dueAt`으로 제공한다. `excerptKind`는 `UTTERANCE`, `SUMMARY`, `TASK_TITLE` 중 하나이며 실제 발화가 아닌 summary를 원문으로 표현하지 않는다. 오디오 URL은 이 계약에 포함하지 않는다.

## 4. 공개 응답 형식

### 성공

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

- `data`는 endpoint별 응답 DTO다.
- `204 No Content`를 제외한 공개 응답은 항상 `meta.requestId`를 제공한다. pagination 같은 추가 메타데이터는 필요한 endpoint에서만 넣는다.
- `204 No Content`에서는 body를 반환하지 않는다.

### 실패

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "업무를 찾을 수 없습니다.",
    "details": {
      "resourceId": "00000000-0000-4000-8000-000000000001"
    }
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

- 성공 응답에 `error: null`, 실패 응답에 `data: null`을 억지로 넣지 않는다.
- `code`는 클라이언트가 분기할 수 있는 안정적인 대문자 `SNAKE_CASE` 값이다.
- `message`에는 환자 정보, transcript, 내부 예외, SQL, 외부 서비스 응답 전문을 넣지 않는다.
- `details`는 validation 오류 등 클라이언트가 수정 가능한 구조화 정보가 필요할 때 object로 제공한다.
- 알 수 없는 예외는 공통 코드로 변환하고 실제 stack trace는 공개 응답에 노출하지 않는다.

## 5. 상태 코드

- `200 OK`: 조회, 수정, 동기 명령 성공
- `201 Created`: 즉시 생성된 resource
- `202 Accepted`: 비동기 작업 접수
- `204 No Content`: 반환 body가 없는 성공
- `400 Bad Request`: 파싱 또는 요청 형식 오류
- `401 Unauthorized`: 실제 인증 도입 이후 인증 실패
- `403 Forbidden`: 인증된 actor에게 해당 resource 권한이 없음
- `404 Not Found`: resource가 없거나 접근 범위 밖이라 존재를 숨겨야 함
- `409 Conflict`: version, 상태 전이, 중복 진행 작업 충돌
- `422 Unprocessable Entity`: 형식은 맞지만 도메인 규칙을 만족하지 않음
- `429 Too Many Requests`: 호출량 제한
- `500 Internal Server Error`: 예상하지 못한 서버 오류
- `502 Bad Gateway`: 외부 AI의 잘못된 응답
- `503 Service Unavailable`: 외부 AI 또는 필수 의존성 일시 장애
- `504 Gateway Timeout`: 외부 AI timeout

생성 endpoint라고 무조건 `201`을 쓰지 않는다. 비동기 작업 resource를 접수하면 `202`, 내부 AI의 동기 추론 성공은 FastAPI 계약에서 정한 `200` 계열을 사용한다.

## 6. 공통 요청 규칙

### Request ID

- 클라이언트는 `X-Request-Id`를 보낼 수 있다.
- 없거나 유효하지 않으면 Node.js가 UUID를 생성한다.
- 공개 응답 `meta.requestId`와 안전한 구조화 로그에 같은 값을 사용한다.
- Python 호출에도 같은 추적 ID를 전달하되 민감한 입력은 로그에 남기지 않는다.

### 멱등성

- 중복 시 부작용이 생기는 생성·확정·작업 접수 API는 `X-Idempotency-Key`를 요구한다.
- 같은 actor, endpoint, key, 정규화된 요청 hash는 같은 결과를 반환한다.
- 같은 key에 다른 요청 hash가 오면 `409`를 반환한다.
- 외부 AI 호출 전후의 멱등성 상태와 완료 결과를 저장한다.

### 데모 세션

- 인증 5개 API가 MVP에서 제외되는 동안 공개 API는 검증된 demo session context를 사용한다.
- session ID 전달 방식은 생성된 공개 OpenAPI에서 하나로 확정한다.
- `userId`, `wardId`, `hospitalId` 같은 접근 범위 식별자를 body 값만으로 신뢰하지 않는다.
- demo session은 실제 인증이나 운영 권한 모델을 대신하지 않는다.

### 시간과 식별자

- 외부 timestamp는 timezone이 포함된 ISO 8601 문자열을 사용하고 저장은 UTC로 한다.
- 근무일처럼 날짜 의미만 있는 값은 `YYYY-MM-DD`, 근무표 월은 `YYYY-MM` 형식으로 분리한다.
- UUID는 문자열 DTO와 validation으로 검사한다.
- 정렬 결과가 같은 경우 안정적인 마지막 정렬 키로 ID를 사용한다.

### Pagination

- 목록 API는 `cursor`, `limit`를 기본으로 사용한다. endpoint 요구가 offset 방식이면 OpenAPI에 예외를 명시한다.
- `limit`의 기본값과 최댓값을 DTO와 테스트에서 고정한다.
- cursor는 opaque string으로 취급하고 내부 DB key를 그대로 노출하지 않는다.
- 응답 pagination 정보는 `meta.page`에 둔다.

## 7. 비동기 작업 계약

OCR, 음성 분석, 업무 추출, 인수인계 사전검증처럼 오래 걸리는 작업은 공통 상태 의미를 따른다.

```text
QUEUED → PROCESSING → SUCCEEDED
                    ↘ FAILED
```

- terminal 상태는 `SUCCEEDED`, `FAILED`다.
- 허용되지 않은 역방향 상태 전이는 거부한다.
- 실패 결과는 공개용 error code, 재시도 가능 여부, 안전한 설명을 제공한다.
- 동일 입력의 진행 중 작업과 재시도 정책은 endpoint별 OpenAPI 및 테스트로 고정한다.
- Python 서비스의 내부 상태를 그대로 공개하지 않고 Node.js의 application 상태로 변환한다.

## 8. 계약 변경 절차

1. `docs/decisions/mvp-scope.md`에서 범위와 소유권 영향을 확인한다.
2. 공개 API는 NestJS DTO·Controller·테스트를 먼저 수정한다.
3. 내부 AI API는 Python FastAPI 작성 원본을 먼저 수정하고 새 artifact를 받는다.
4. OpenAPI를 다시 생성하거나 동기화한다.
5. 모바일·Python 영향과 breaking change 여부를 PR에 적는다.
6. lint, typecheck, test, build, `openapi:check`를 실행한다.

필드를 삭제하거나 의미를 바꾸는 breaking change는 같은 `/v1`에서 임의로 진행하지 않는다. 새 필드를 먼저 optional로 추가하고 consumer 전환 후 제거하거나 API version 변경을 검토한다.

## 9. 보안 규칙

- 예시에는 synthetic UUID와 비식별 데이터만 사용한다.
- access token, internal token, API key, cookie 실값을 문서와 OpenAPI example에 넣지 않는다.
- 환자 이름, 병실, 임상 기록, 원본 음성, transcript 전문을 example이나 로그에 넣지 않는다.
- 내부 AI endpoint는 공개 router와 분리하고 서비스 간 인증 값을 코드에 하드코딩하지 않는다.
