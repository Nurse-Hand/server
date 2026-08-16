# AGENTS.md

이 파일은 Nurse Hand 서버 저장소에서 Codex가 따라야 하는 작업 규칙입니다.

## 시작 전 필수 확인

1. `git status --short --branch`로 현재 브랜치와 기존 변경사항을 확인합니다.
2. GitHub 작업 전에는 `.agents/rules/github.md`를 읽습니다.
3. Issue 생성부터 PR 작성까지 수행할 때는 `.agents/skills/github-workflow/SKILL.md`를 따릅니다.
4. 서버 코드 작업 전에는 `.agents/rules/backend.md`를 읽습니다.
5. 사용자가 만들지 않은 변경사항은 되돌리거나 덮어쓰지 않습니다.

## 기본 작업 방식

- 별도 요청이 없으면 한국어로 설명하고 코드 식별자와 명령어는 원문을 유지합니다.
- 작업은 GitHub Issue 한 개를 기준으로 범위를 제한합니다.
- 동작 변경은 가능하면 실패하는 테스트를 먼저 추가한 뒤 구현합니다.
- 새 프레임워크나 공통 추상화는 현재 코드와 팀 결정을 확인한 뒤 도입합니다.
- 민감정보, 환자 데이터, 원본 음성, 토큰을 코드, fixture, 로그, PR 본문에 넣지 않습니다.
- 외부 AI 호출은 비용, 재시도, timeout, idempotency 영향을 함께 검토합니다.

## Git 안전 규칙

- 부트스트랩 이후 `main`과 `dev`에 직접 push하지 않습니다.
- `git add .`와 `git add -A`를 사용하지 않고 변경 파일을 명시적으로 stage합니다.
- `git reset --hard`, 강제 checkout, 강제 push는 사용자의 명시적 승인 없이 실행하지 않습니다.
- 커밋, 브랜치, PR 형식은 `docs/conventions/github.md`를 따릅니다.

## 검증과 보고

- 저장소에 `package.json`이 생기면 해당 파일의 scripts를 기준으로 lint, test, build를 실행합니다.
- 실행할 수 없는 검증은 통과로 간주하지 않고 이유와 남은 위험을 적습니다.
- 완료 보고에는 변경 파일, 실제 동작, 실행한 명령과 결과, 확인하지 못한 항목을 포함합니다.
