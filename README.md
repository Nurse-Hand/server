# Nurse Hand Server

Nurse Hand 모바일 앱의 API와 비동기 작업을 담당하는 Node.js 서버 저장소입니다.

현재 저장소에는 팀 협업을 위한 GitHub 컨벤션과 Codex 하네스만 구성되어 있습니다. Node.js 프레임워크와 실행 명령은 서버 스캐폴딩을 추가하는 PR에서 확정합니다.

## 문서

- [GitHub 협업 컨벤션](docs/conventions/github.md)
- [기여 방법](CONTRIBUTING.md)

## 아키텍처 경계

- Node.js 서버: 인증, 환자 및 라운딩 세션, 타임라인, 업무 우선순위, 인수인계 API와 작업 오케스트레이션
- Python AI 서버: STT, 화자 분리, 구조화, AI 역질문 등 모델 추론
- React Native 앱: 로컬 VAD, 녹음 제어, 사용자 확인 및 수정 UI

환자 정보와 원본 음성은 민감정보로 취급합니다. 실제 데이터, 인증정보, 음성 파일을 저장소나 로그에 남기지 않습니다.

