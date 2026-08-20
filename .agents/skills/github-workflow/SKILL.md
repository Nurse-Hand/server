---
name: github-workflow
description: Nurse Hand server의 Issue, branch, worktree, commit, Draft PR 흐름을 실행한다.
---

# GitHub Workflow

GitHub 협업 작업을 시작하면 먼저 `.agents/rules/github.md`와 `docs/conventions/github.md`를 읽습니다.

## 1. 현재 상태 확인

```bash
git status --short --branch
git remote -v
gh auth status
```

- 기존 변경사항과 현재 브랜치를 기록합니다.
- 사용자 변경사항이 있으면 해당 파일을 임의로 되돌리거나 섞지 않습니다.
- 최초 `#0` 부트스트랩 외에는 `main` 또는 `dev`에서 구현하지 않습니다.

## 2. Issue 확정

- 사용자가 Issue 번호를 제공했다면 `gh issue view <number>`로 범위와 완료 조건을 확인합니다.
- Issue가 없다면 문제, 완료 조건, 범위 밖을 포함한 초안을 제시하고 사용자 승인 후 생성합니다.
- Issue 번호가 확정되기 전에는 작업 브랜치, commit, PR을 만들지 않습니다.

## 3. 브랜치 또는 Worktree 생성

일반 작업은 최신 `origin/dev`에서 시작합니다.

```bash
git fetch origin
git worktree add ../.worktrees/server/<issue>-<description> \
  -b <type>/<issue>-<description> origin/dev
```

긴급 수정만 최신 `origin/main`에서 `hotfix/<issue>-<description>`으로 시작합니다.

## 4. 구현과 검증

- Issue 범위 안의 파일만 변경합니다.
- 동작 변경에는 관련 테스트를 추가합니다.
- `package.json` scripts를 기준으로 관련 lint, test, build를 실행합니다.
- 실행하지 못한 검증과 이유를 PR의 `추가 고려 사항`에 남깁니다.

## 5. Commit

변경 파일을 하나씩 확인한 뒤 필요한 경로만 stage합니다.

```bash
git diff --check
git add <path-1> <path-2>
git diff --cached --check
git diff --cached --stat
```

커밋 메시지는 다음 구조를 사용합니다.

```text
<type>(#<issue>): <한국어 요약>

<변경 의도와 목적>

- <파일 또는 모듈>: <실제 변경 내용과 이유>
- 검증: <실행 명령과 결과>

Refs: #<issue>
```

## 6. Draft PR

- 첫 검증 가능한 commit을 push한 뒤 `dev` 대상 Draft PR을 만듭니다.
- 제목은 `[<Type>/#<issue>]: <한국어 결과>` 형식을 사용합니다.
- `.github/pull_request_template.md`의 각 항목을 실제 diff와 검증 결과로 채웁니다.
- Issue를 완전히 해결하면 `Closes #<issue>`, 일부만 다루면 `Refs #<issue>`를 사용합니다.
- Ready 전환 뒤 작성자 외 리뷰어의 명시적 승인을 기다립니다.

## 7. Ready와 병합 게이트

병합 직전에 다음 순서를 지킵니다.

1. PR 작성자, 현재 `headRefOid`, base, Draft 여부, mergeability, reviews, status checks를 조회합니다.
2. 작성자 외 `APPROVED` 리뷰가 있는지 확인합니다.
3. 승인 뒤 head SHA가 바뀌었다면 병합하지 않고 재리뷰를 요청합니다.
4. 현재 head의 `verify`와 `postgres-integration`이 모두 성공했는지 확인합니다.
5. 선행 PR과 파일 교집합, migration, 생성 OpenAPI 순서를 확인합니다.
6. 한 PR만 병합하고 `origin/dev`를 fetch한 뒤 다음 PR을 다시 검토합니다.

```bash
gh pr view <number> \
  --json author,isDraft,headRefOid,baseRefName,mergeable,mergeStateStatus,reviews,statusCheckRollup
git fetch origin
git rev-parse origin/dev
```

현재 비공개 저장소 플랜에서 ruleset 또는 branch protection API가 `403`이면 수동 게이트를 사용합니다. 승인 없는 self-merge나 이전 head의 CI 결과를 정상으로 간주하지 않습니다.

## 8. 완료 보고

다음을 짧게 보고합니다.

1. Issue, branch, PR 링크 또는 번호
2. 변경 파일과 실제 동작
3. 실행한 검증 명령과 결과
4. 남은 위험과 실행하지 못한 검증
