# GitHub Workflow Rules

세부 형식과 예시는 `docs/conventions/github.md`를 기준으로 합니다.

## 브랜치

- `main`: 배포 가능한 릴리스 브랜치
- `dev`: 기능 통합 브랜치
- 일반 작업: `dev`에서 분기하고 PR 대상도 `dev`로 설정
- 긴급 수정: `main`에서 `hotfix/<issue>-<description>`으로 분기하고 `main` 병합 후 `dev`에 동기화
- 형식: `<type>/<issue-number>-<short-kebab-description>`

## 작업 게이트

1. 새 작업은 먼저 Issue를 만들고 범위를 합의합니다.
2. Issue 번호가 확정된 뒤 브랜치 또는 worktree를 만듭니다.
3. 첫 검증 가능한 커밋 이후 Draft PR을 만듭니다.
4. Ready 전환과 병합은 사람의 승인을 받습니다.

## 커밋

- 한 커밋에는 한 가지 목적만 포함합니다.
- 제목: `<type>(#<issue-number>): <한국어 요약>`
- 본문: 변경 의도와 주요 파일별 변경 근거를 작성합니다.
- 마지막 줄: `Refs: #<issue-number>`
- 변경 파일을 명시적으로 stage하며 `git add .`와 `git add -A`를 사용하지 않습니다.

## 보호 대상

- 초기 부트스트랩 커밋만 `#0`과 `main` 직접 push를 허용합니다.
- 이후 `main`과 `dev` 직접 push를 금지합니다.
- 테스트 또는 정적 검사가 실패한 상태를 정상 커밋으로 만들지 않습니다.
- 비밀값, 환자 정보, 원본 음성, 운영 로그를 commit 또는 PR에 포함하지 않습니다.

