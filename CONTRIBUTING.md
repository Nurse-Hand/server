# Contributing

개발을 시작하기 전에 [GitHub 협업 컨벤션](docs/conventions/github.md)을 읽습니다.

핵심 흐름은 다음과 같습니다.

1. 작업할 GitHub Issue를 만들고 범위를 합의합니다.
2. `dev`에서 `<type>/<issue-number>-<short-kebab-description>` 브랜치를 만듭니다.
3. 관련 테스트와 함께 한 가지 목적의 변경을 커밋합니다.
4. 첫 검증 가능한 커밋 이후 Draft PR을 만들고 `dev`를 대상으로 리뷰합니다.
5. 사람의 승인을 받은 뒤 병합합니다.

초기 저장소 구성 커밋만 `main` 직접 푸시와 `#0` 사용을 허용합니다. 부트스트랩 이후에는 `main`과 `dev`에 직접 푸시하지 않습니다.

