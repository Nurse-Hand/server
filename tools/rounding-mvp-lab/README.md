# Rounding MVP Lab

라운딩 MVP의 공개 API를 브라우저에서 순서대로 확인하는 개발용 하네스입니다. 실제 계약의 기준은 현재 `dev`의 Controller/DTO와 `openapi/public.json`이며, embedded mock은 연결할 API가 등록되지 않은 경우에만 보조 자료로 사용합니다.

## 실행

```bash
npm run rounding-mvp-lab:generate
npm run rounding-mvp-lab:smoke
docker compose --env-file .env.local -f docker-compose.local.yml up -d
```

브라우저에서 `http://localhost:5173`을 열고 API Base URL은 기본값인 같은 origin을 사용합니다. `demo-ui`의 `/api/**` 요청은 로컬 `api` 컨테이너로 전달되므로 별도 브라우저 CORS 설정이 필요하지 않습니다.

- `DEMO_MODE=true`: `Demo Session`을 먼저 생성하고 발급된 SENDER/RECEIVER 값을 사용합니다.
- `DEMO_MODE=false`, `NO_LOGIN_MVP_CONTEXT=true`: Demo Session 입력을 비워 두고 바로 실제 API를 호출합니다.
- precheck 전에는 현재 SENDER `NurseShift.id`와 수신 근무가 시작되는 서울 기준 `인수인계 날짜`를 입력합니다. UUID는 사용자 토큰이나 API secret이 아닙니다.

로컬 기본 데이터베이스에서 shift 식별자를 확인하는 예시는 다음과 같습니다.

```bash
docker compose --env-file .env.local -f docker-compose.local.yml exec -T db \
  psql -U nurse_hand -d nurse_hand -Atc 'SELECT id, "duty", "date" FROM "NurseShift" ORDER BY "date", id;'
```

## 실제 호출 순서

1. `GET /api/v1/health`
2. 선택적으로 `POST /api/v1/demo-sessions`
3. `GET /api/v1/patients`
4. `POST /api/v1/rounding-sessions`
5. 환자별 `POST /api/v1/rounding-sessions/{sessionId}/patient-segments`
6. `POST /api/v1/rounding-sessions/{sessionId}/complete`
7. 세션 전체 녹음 `File` 1개를 `file` 필드로 `POST /api/v1/files/audio`
8. `POST /api/v1/rounding-sessions/{sessionId}/analysis-jobs`
9. `POST /api/v1/rounding-sessions/{sessionId}/analysis-confirmation`
10. `GET /api/v1/tasks?date=YYYY-MM-DD`로 간호사가 직접 생성한 업무 조회
11. `POST /api/v1/handoff-prechecks` 후 terminal 상태까지 GET polling
12. `POST /api/v1/handoffs` 후 terminal 상태까지 GET polling

자동 업무 추출과 AI 우선순위 산정은 최신 개발 문서에서 P2 보류입니다. 서버에 이미 존재하는 관련 API를 삭제하지 않지만, 이 하네스의 MVP 핵심 흐름은 호출하지 않습니다. 업무는 간호사가 직접 생성한 `tasks`를 기준으로 조회합니다.

`X-Idempotency-Key`가 필요한 생성 요청은 method·path·body가 같은 재시도에서만 동일한 값을 재사용하고, 날짜나 body가 바뀌면 새 값을 사용합니다. HTTP 오류 원문은 화면에 보존하며, fallback 모드는 `404 ROUTE_NOT_FOUND`에만 mock을 표시합니다. 환자·세션 같은 도메인 404, 409, 422, 5xx, timeout은 성공으로 바꾸지 않습니다.

## 데이터 경계

- 음성 원본은 저장소에 커밋하지 않습니다.
- `audio-manifest.json`에는 저장소 기준 상대 경로와 파일명만 둡니다.
- API key, 토큰, 로컬 절대 경로는 mockdata와 브라우저 로그에 넣지 않습니다.
- `/rounding-sessions/{sessionId}/audio-chunks`는 녹음 청크 저장용 별도 공개 API입니다. 이 하네스는 완료된 파일의 업로드·분석 경계를 검증하므로 해당 경로를 호출하지 않습니다.
- AI 내부 API를 브라우저에서 직접 호출하지 않습니다. 서버가 공개 API 뒤에서 AI 계약을 소유합니다.
- 비동기 Task·Handoff 처리는 `worker` 컨테이너가 담당하므로 로컬 통합 검증에서는 `api`, `worker`, `ai`, `db`를 함께 실행합니다.

## 검증

```bash
npm run rounding-mvp-lab:generate
npm run rounding-mvp-lab:smoke
```

smoke는 HTML asset, 두 embedded artifact의 JSON 동기화, 실제 공개 OpenAPI route, enum/응답 구조, multipart 헤더, Job polling, route-not-found와 domain-not-found 구분을 확인합니다. 실제 통합 확인에서는 Docker Compose로 migration과 seed를 적용한 뒤 위 호출을 순서대로 실행하고 HTTP status/response를 보존합니다.
