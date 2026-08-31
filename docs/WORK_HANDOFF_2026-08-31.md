# 작업 인계 — 2026-08-31

## 기준 소스

- 저장소: https://github.com/wafflecomm/TrafficCatcher
- 이어서 작업할 브랜치: `main`
- 운영: https://trafficcatcher.ai/ (Cloudflare Pages)
- 이 문서 작성 시 기능 배포 기준: `b6c6774`
- 이 문서는 작업 인계용이며 새 기능이나 아이콘 크기 조정을 적용하지 않는다.

## 완료 및 운영 반영

1. `1e6debc` — 글서랍에 본문·삽화/쇼츠 4컷 프롬프트·작성 모드·메모 입력을 함께 저장하고 이어서 작성.
   - 기존 원고 호환, 계정별 접근 검사, 기존 요금제별 저장 개수 제한 유지.
   - 상세: [글서랍 저장 구조](DRAFT_LIBRARY_BUNDLES.md).
2. `0a38931` — 폴더블에서 글쓰기 전환 로딩 메시지가 오른쪽으로 밀리는 문제 수정.
   - body 전체 transform 제거, 페이드 유지, 전환 중 가로 넘침 제한.
   - VisualViewport 기준으로 메시지·진행 바 위치 갱신.
   - 완료·취소·뒤로가기/BFCache 시 이벤트와 진행 상태 정리.
   - 브라우저 검사 274개와 전환 로직 테스트 5개 통과.
   - 폴드6 실기기/PWA의 최종 확인은 별도로 필요.
3. `b6c6774` — 승인 이미지로 불투명 RGB 앱 아이콘 192px·512px 생성.
   - 일반용 any와 안드로이드용 maskable을 따로 등록.
   - 루트/static 매니페스트 및 기존 루트 아이콘 경로 동기화.
   - 아이콘 URL 버전: `20260831-app-1`.
   - favicon·Apple 터치 아이콘 및 시작 화면 흰색 배경은 유지.
   - 운영 두 도메인의 아이콘 파일 해시가 로컬 검증본과 일치하는 것 확인.

## 다음 작업 후보 — 아직 적용하지 않음

사용자가 새 아이콘에서 여백이 줄고 이미지가 커 보인다고 보고했다.

- 파일 기준 흰 로고 너비는 이전 약 80.5%, 현재 약 66.0%이다.
- 실제 커 보이는 현상은 maskable 표시 시 안드로이드가 외곽을 잘라 표시하는 영향으로 추정한다. 기기 화면의 실제 배율은 아직 측정하지 않았다.
- 제안: 보라색 배경을 유지하고 **안드로이드 전용 로고만 현재보다 15~20% 축소**하여 여유 확보.
- 이는 제안일 뿐이다. 사용자의 적용 요청 전에는 아이콘을 다시 축소하거나 배포하지 않는다.
- 안전 영역 안에 들어가는 것과 사용자가 원하는 시각적 여백은 별도 기준이다.
- 설치 앱 아이콘은 갱신이 늦을 수 있다. 로컬 원고·프로필 사진 보존을 위해 앱 데이터 전체 삭제를 기본 해결책으로 안내하지 않는다.

## 원본·검증 위치

- 승인 이미지: `static/traffic-catcher-app-icon-source.png` (1254×1254, RGB).
- 재생성: Pillow가 있는 개발용 Python으로 `python scripts/build_app_icons.py`.
- 아이콘 검사: `python -m unittest discover -s tests -p test_app_icons.py`.
- 전환/글서랍 검사: `node --test tests/page-transitions.test.mjs tests/draft-bundle.test.mjs`.
- Python 글서랍 검사: `python -m unittest discover -s tests -p test_draft_bundle.py`.
- 화면 검증: HTTP로 `tests/studio-navigation-centering.html` 열기. 모의 화면 검사는 실기기 검증과 구분한다.
- [디자인 가이드 MD](design/TRAFFIC_CATCHER_DESIGN_GUIDE.md) / [HTML](design/TRAFFIC_CATCHER_DESIGN_GUIDE.html).

## 다른 컴퓨터에서 시작

1. 기존 작업 폴더에서 `git status`로 미커밋 변경 여부를 확인한다.
2. 변경이 없고 main 브랜치라면 `git pull --ff-only origin main`으로 최신 소스를 받는다.
3. 변경이 있거나 브랜치가 분기되어 있으면 먼저 별도 보존·비교한다. 강제 초기화하거나 무조건 덮어쓰지 않는다.
4. API 키·로컬 DB·환경변수는 Git에 포함하지 않는다. 해당 컴퓨터의 기존 환경설정을 사용한다.
5. 이 컴퓨터의 기존 루트에는 과거 변경이 남아 있어, 최근 배포는 최신 main 기반 별도 작업 폴더 `.codex-loading-center`에서 필요한 변경만 선별해 진행했다. 루트의 변경을 통째로 main에 올리지 않는다.
