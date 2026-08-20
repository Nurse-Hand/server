# GitHub 협업 컨벤션

## 1. 기본 브랜치

| 브랜치 | 역할                          | 직접 push |
| ------ | ----------------------------- | --------- |
| `main` | 배포 가능한 릴리스            | 금지      |
| `dev`  | 기능 통합 및 다음 릴리스 준비 | 금지      |

저장소 최초 구성 커밋만 예외로 `main` 직접 push를 허용합니다. 최초 push 후 `main`에서 `dev`를 만들고, 이후 일반 작업은 `dev`에서 시작합니다.

## 2. 작업 흐름

1. GitHub Issue에 문제, 완료 조건, 범위를 작성합니다.
2. Issue 번호가 정해지면 `dev` 최신 상태에서 브랜치를 만듭니다.
3. 가능하면 별도 worktree에서 구현하고 테스트합니다.
4. 첫 검증 가능한 커밋 이후 `dev` 대상 Draft PR을 만듭니다.
5. 리뷰 반영과 검증이 끝나면 사람의 승인 후 병합합니다.
6. `dev`에서 릴리스 검증 후 `main`으로 릴리스 PR을 만듭니다.

## 3. 브랜치 이름

형식:

```text
<type>/<issue-number>-<short-kebab-description>
```

허용 type:

| type       | 용도                          |
| ---------- | ----------------------------- |
| `feat`     | 새로운 기능                   |
| `fix`      | 버그 수정                     |
| `refactor` | 동작을 유지하는 구조 변경     |
| `test`     | 테스트 추가 및 수정           |
| `docs`     | 문서 변경                     |
| `chore`    | 설정, 빌드, 의존성, 운영 작업 |
| `hotfix`   | 운영 긴급 수정                |

예시:

```text
feat/12-rounding-session
fix/27-audio-upload-timeout
chore/31-server-ci
hotfix/42-auth-failure
```

긴급 수정은 `main`에서 분기해 `main`으로 PR을 보내고, 병합 결과를 `dev`에도 반영합니다.

## 4. Worktree

여러 작업을 병렬로 진행할 때 저장소 내부에 중첩 clone을 만들지 않고 상위 프로젝트의 `.worktrees/server`를 사용합니다.

```bash
git fetch origin
git worktree add ../.worktrees/server/12-rounding-session \
  -b feat/12-rounding-session origin/dev
```

Codex 앱이 별도의 관리형 worktree를 생성한 경우에는 앱이 관리하는 격리 경로를 허용합니다. 어떤 방식이든 두 작업이 같은 worktree를 공유하지 않습니다.

## 5. 커밋

제목 형식:

```text
<type>(#<issue-number>): <한국어 요약>
```

전체 형식:

```text
feat(#12): 라운딩 세션 생성 API 추가

녹음 청크를 환자별 라운딩 세션에 연결할 수 있도록 생성 흐름을 추가합니다.

- src/rounding: 세션 생성과 입력 검증 추가
- test/rounding: 중복 요청과 잘못된 환자 ID 테스트 추가

Refs: #12
```

규칙:

- `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` 중 하나를 사용합니다.
- 제목은 실제 결과를 짧게 표현합니다.
- 본문에는 변경 목적과 주요 파일 또는 모듈의 변경 근거를 적습니다.
- 한 커밋에는 한 가지 목적만 포함합니다.
- 변경 파일을 `git add <path>`로 명시하고 `git add .`, `git add -A`는 사용하지 않습니다.
- `#0`은 Issue 운영 전 최초 부트스트랩 커밋에만 사용합니다.
- `hotfix`는 브랜치 type이며, 해당 브랜치의 버그 수정 커밋에는 `fix`를 사용합니다.
- `style`은 커밋 type으로만 사용하며, 스타일 변경 브랜치는 `chore`를 사용합니다.

## 6. Pull Request

제목 형식:

```text
[<Type>/#<issue-number>]: <한국어 결과>
```

예시:

```text
[Feat/#12]: 라운딩 세션 생성 API 추가
[Fix/#27]: 오디오 업로드 timeout 처리
```

본문은 `.github/pull_request_template.md`를 사용하며 다음 정보만 사실 기반으로 작성합니다.

- 해결하려는 문제 또는 배경
- 파일 및 모듈별 실제 변경 내용
- 화면, 커밋, 테스트 명령이나 로그 등 검증 근거
- 잠재 위험, 범위 밖, 후속 작업

Issue를 완전히 해결하면 `Closes #<number>`, 일부만 다루면 `Refs #<number>`를 사용합니다.

## 7. 병합

- 기능 브랜치에서 `dev`: rebase merge
- `dev`에서 `main`: release PR의 merge commit
- `hotfix`에서 `main`: 리뷰 후 merge하고 `dev`에 동일 변경 동기화
- Ready 전환과 병합은 작성자 외 사람의 승인을 받아 진행합니다.

### 7.1 수동 병합 게이트

현재 비공개 저장소 플랜에서는 ruleset과 branch protection API가 `403`을 반환하므로, 아래 절차를 병합 담당자가 수동으로 확인합니다. 저장소 플랜이 바뀌면 같은 조건을 GitHub 설정으로 강제하고 문서의 수동 항목을 줄입니다.

1. Draft PR 본문의 5개 section과 체크리스트가 실제 diff·검증 결과와 일치하는지 확인합니다.
2. Ready 전환 뒤 PR 작성자가 아닌 리뷰어에게 승인을 받습니다. 작성자의 self-approval은 승인으로 계산하지 않습니다.
3. 승인 당시 head SHA를 기록하고, 병합 직전 현재 head SHA와 비교합니다. SHA가 바뀌었으면 이전 승인을 사용하지 않고 다시 리뷰와 승인을 받습니다.
4. 현재 head의 `verify`와 `postgres-integration`이 모두 성공했는지 확인합니다. 이전 SHA의 성공 결과는 사용하지 않습니다.
5. 선행 PR, 파일 교집합, migration 적용 순서, 생성 OpenAPI 영향을 확인합니다.
6. 여러 PR을 한꺼번에 병합하지 않습니다. 하나를 병합한 뒤 `git fetch origin`으로 `origin/dev`를 갱신하고 다음 PR의 base·충돌·CI를 다시 확인합니다.
7. 기능 브랜치는 `dev`에 rebase merge하고, 병합 결과와 Issue 종료 상태를 확인합니다.

병합 직전 최소 확인 명령은 다음과 같습니다.

```bash
gh pr view <number> --json author,isDraft,headRefOid,baseRefName,mergeable,mergeStateStatus,reviews,statusCheckRollup
git fetch origin
git rev-parse origin/dev
```

명령 출력만으로 승인의 유효성을 추측하지 않습니다. 리뷰어가 작성자와 다른지, 승인 뒤 head가 바뀌지 않았는지, check가 현재 head에서 실행됐는지를 함께 확인합니다.

### 7.2 확인 책임

- 작성자: PR 본문, 검증 결과, head SHA 변경 사실을 최신 상태로 유지합니다.
- 리뷰어: 실제 diff와 검증 근거를 확인한 뒤 승인하며, head 변경 시 다시 검토합니다.
- 병합 담당자: 승인·현재 head CI·선행 순서·mergeability를 병합 직전에 최종 확인합니다.
- GitHub 설정으로 강제되지 않는 동안 위 역할을 CI 성공만으로 대체하지 않습니다.
