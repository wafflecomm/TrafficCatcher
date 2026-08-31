# 미완의 글서랍: 본문·삽화·쇼츠 저장

최종 갱신: 2026-08-31

## 사용자 동작

1. 글을 작성한 다음 글서랍의 저장을 누른다. 현재 표시된 본문과 삽화·쇼츠 프롬프트, 작성 모드, 메모 원본이 함께 저장된다.
2. 글서랍 목록에서 글을 선택하고 `이어서 작성`을 누른다.
3. 해당 작성 모드의 내용이 있다면 교체를 확인한다. 저장 당시 모드와 본문·각 4컷 탭이 복원된다.
4. 이어서 보완한 후 저장하면 같은 원고를 갱신한다. 다른 모드에 작성하던 글은 유지된다.

## API와 저장 구조

- 기존 `POST /api/auth/drafts`, `GET /api/auth/drafts/:id`를 사용한다.
- `user_drafts.bundle_json TEXT NOT NULL DEFAULT '{}'`를 추가한다. 로컬 SQLite와 운영 D1 모두 기존 테이블을 유지하는 추가형 마이그레이션이다.
- POST의 선택 필드 `draft_id`는 로그인한 사용자 소유 원고일 때만 갱신한다. 없는 경우 기존 제목 기준 저장 동작을 유지한다.
- POST의 `bundle`이 생략된 구버전 클라이언트는 기존 묶음을 지우지 않는다. 명시적인 빈 배열은 해당 프롬프트를 비운다.
- 상세 응답은 `bundle`과 `article_mode`, `illustration_count`, `shorts_count`를 제공한다. 목록은 요약 수치만 제공하고 프롬프트 전체를 전송하지 않는다.
- 묶음 형식: `version: 1`, `article_mode: keyword | story`, `keyword`, `illustration_storyboard`, `shorts_storyboard`, `story_input`.
- 컷 필드: `cut`, `time`, `role`, `conceptKo`, `promptEn`. 종류별 최대 4컷이며 입력 길이와 전체 정규화 JSON 200KB 제한을 검사한다. 프롬프트는 자르지 않고 제한 초과 시 저장 오류를 안내한다.
- 비밀 키나 시스템 지침, 프로필 설정은 묶음에 포함하지 않는다. 저장 원고의 텍스트와 프롬프트는 표시할 때 HTML 이스케이프한다.
- 기존 `{}` 데이터는 `version: 0`으로 읽는다. 모드를 추정하지 않고 현재 탭을 사용하며 저장되지 않은 4컷은 빈 상태로 둔다.
- 저장 한도는 기존 회원 등급 정책을 유지한다. 본문+삽화+쇼츠를 글 1개로 계산한다.

## 적용과 검증

- 로컬 서버를 재시작하면 첫 회원 DB 접근 시 열을 추가한다. 운영은 소스 배포 후 새 스키마 버전 `20260831-draft-bundle-v1`에서 열을 추가한다.
- 운영 DB에는 이 개발 작업 중 접속하거나 마이그레이션을 실행하지 않았다.
- 로컬 테스트: `python -m unittest discover -s tests -p test_draft_bundle.py -v`
- Worker·클라이언트 로직 테스트: `node --test tests/draft-bundle.test.mjs` (Node 24의 내장 SQLite 사용)
- 테스트는 임시/메모리 DB만 사용하며 구버전 마이그레이션, 왕복 보존, 제목 변경, 타계정 접근 차단, 누락·과대 데이터, 모드 복원·취소·텍스트 이스케이프를 검사한다.
