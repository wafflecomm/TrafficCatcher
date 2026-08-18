# Traffic Catcher 버튼 기반 수집·배포 고도화 기획안

> 상태: 향후 검토용 — 현재 시스템에는 적용하지 않음
>
> 현재 운영 방식인 로컬 15분 수집 및 GitHub Actions의 KST 06:17~23:17 매시간 자동 수집·Cloudflare Pages 배포를 그대로 유지한다.

## 1. 목적

Cloudflare Pages에 배포된 Traffic Catcher에서 관리자가 **실시간 데이터 수집** 버튼을 눌렀을 때만 GitHub Actions의 데이터 수집 워크플로를 실행하고, 데이터가 변경된 경우 Cloudflare Pages까지 자동으로 다시 배포하는 방식을 검토한다.

## 2. 목표 동작

```text
관리자가 Cloudflare의 실시간 데이터 수집 버튼 클릭
        ↓
Cloudflare Pages Function에 수집 요청
        ↓
관리자 권한 및 재실행 제한 확인
        ↓
GitHub Actions workflow_dispatch 실행
        ↓
실시간 트렌드 데이터 수집
        ↓
데이터가 변경된 경우에만 Git commit 및 push
        ↓
Cloudflare Pages 자동 배포
```

데이터가 이전 결과와 같거나 수집에 실패한 경우에는 기존 데이터를 기본값으로 대체하지 않고, 새 커밋과 Cloudflare 재배포도 발생시키지 않는다.

## 3. 구현 구성

### Cloudflare Pages

- 프런트엔드의 수집 버튼은 GitHub API를 직접 호출하지 않는다.
- Pages Function에 수집 요청 전용 API를 추가한다.
- GitHub 인증 토큰은 Cloudflare Secret에 암호화하여 저장한다.
- 요청 접수, 수집 중, 배포 대기, 완료 및 실패 상태를 화면에 표시한다.

### GitHub Actions

- `workflow_dispatch`를 통해 외부 요청으로 워크플로를 실행한다.
- 버튼 실행 전용 입력값이나 요청 식별자를 필요에 따라 전달한다.
- 실제 데이터 변경이 있는 경우에만 커밋하고 푸시한다.
- 버튼 실행 방식으로 완전히 전환할 경우 기존 시간대별 `schedule` 항목을 제거한다.

### 보안 및 사용량 보호

- GitHub 토큰을 HTML이나 브라우저 JavaScript에 포함하지 않는다.
- 관리자 인증 또는 Cloudflare Access를 통과한 사용자만 실행할 수 있게 한다.
- 중복 클릭 및 과도한 실행을 막기 위해 최소 10~30분의 재실행 제한을 둔다.
- 실행 중인 워크플로가 있으면 새 요청을 거절하거나 기존 실행 상태를 반환한다.
- 요청·실행·성공·실패 이력을 남겨 사용량과 장애를 확인할 수 있게 한다.

## 4. 예상 사용자 경험

버튼을 누르면 즉시 새 데이터가 표시되는 것이 아니라 다음 상태를 순서대로 안내한다.

1. 수집 요청 접수
2. GitHub에서 데이터 수집 중
3. 변경 데이터 반영 및 Cloudflare 배포 대기
4. 배포 완료 후 새로고침 안내 또는 자동 새로고침

GitHub Actions 실행과 Cloudflare Pages 배포에는 수분이 걸릴 수 있다.

## 5. 전환 선택지

### 완전 수동 방식

- 버튼을 눌렀을 때만 GitHub Actions를 실행한다.
- 기존 시간대별 자동 스케줄을 제거한다.
- 실행 횟수와 Cloudflare 빌드 횟수를 가장 적극적으로 줄일 수 있다.
- 관리자가 버튼을 누르지 않으면 데이터가 장시간 갱신되지 않을 수 있다.

### 자동 스케줄 병행 방식

- 현재의 KST 06:17~23:17 매시간 자동 수집을 유지하면서 버튼으로 즉시 수집도 허용한다.
- 정기 갱신 안정성이 높지만 버튼 실행만큼 추가 빌드 가능성이 생긴다.
- 버튼 호출 제한과 월간 빌드 사용량 모니터링이 필요하다.

## 6. 적용 전 확인 사항

- Cloudflare Pages Functions 사용 가능 여부 및 프로젝트 설정
- GitHub Actions 실행 권한만 가진 최소 권한 토큰 준비
- 관리자 인증 방식 확정
- 버튼 재실행 제한 시간 확정
- 실행 상태 조회 및 완료 감지 방식 확정
- 시간대별 자동 스케줄 제거 여부 최종 결정
- 월간 GitHub Actions 및 Cloudflare Pages 사용량 점검

## 7. 현재 유지 사항

이 문서 작성 시점에는 코드, GitHub Actions 스케줄 및 Cloudflare 배포 설정을 변경하지 않는다.

- 로컬 서버: 15분 간격 자동 수집 유지
- GitHub Actions: KST 06:17~23:17에 1시간 간격 자동 수집 유지
- Cloudflare Pages: GitHub 변경사항 기반 자동 배포 유지
- GitHub Actions 수동 실행 기능: 기존 상태 유지
