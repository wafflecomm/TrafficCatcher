# Traffic Catcher Cloudflare Cron Scheduler 운영 가이드

- 최종 갱신: 2026-08-27
- 목적: GitHub Actions `schedule` 지연·누락을 피하고 Cloudflare Cron Trigger가 수집 시각을 관리하게 한다.

## 1. 운영 구조

```text
Cloudflare Cron Trigger
        ↓ workflow_dispatch
GitHub Actions
        ↓
portal_crawler.py
        ↓
JSON·CSV 커밋
        ↓
Cloudflare 운영 배포
```

Cloudflare가 스케줄 소유자이고 GitHub Actions는 Python 수집 실행기로만 사용한다. GitHub 워크플로에는 `schedule` 이벤트를 두지 않고 `workflow_dispatch` 인터페이스만 유지한다.

GitHub REST API는 `2026-03-10` 버전을 사용한다. 워크플로 실행 요청의 성공 응답은 실행 ID와 URL을 포함하는 HTTP `200`이며, 이전 호환 응답인 `204`도 성공으로 처리한다.

## 2. 소스 구성

| 파일 | 역할 |
|---|---|
| `cloudflare-scheduler/worker.js` | Cron을 GitHub `workflow_dispatch` 요청으로 변환 |
| `wrangler.scheduler.toml` | 별도 Scheduler Worker·변수·Cron 정의 |
| `.github/workflows/crawl_and_deploy.yml` | 실시간 수집 실행 |
| `.github/workflows/crawl_daily_discovery.yml` | 시즌·문화·OTT 일일 수집 실행 |

## 3. 스케줄

Cloudflare Cron Trigger는 UTC 기준으로 등록한다.

| 데이터 | KST | UTC Cron | GitHub Workflow |
|---|---|---|---|
| 실시간 포털·방송 | 06:00~23:30 매 30분 | `0,30 0-14,21-23 * * *` | `crawl_and_deploy.yml` |
| 시즌·문화·OTT | 매일 06:30·10:30·14:30·18:30·22:30 | `30 1,5,9,13,21 * * *` | `crawl_daily_discovery.yml` |

시즌·문화·OTT는 06:30부터 22:30까지 4시간 간격으로 실행하고, 02:30 실행은 야간 자동수집 중지 원칙에 따라 제외한다.

## 4. GitHub Fine-grained PAT

GitHub에서 전용 Fine-grained Personal Access Token을 생성한다.

```text
Repository access: Only select repositories → TrafficCatcher
Repository permissions:
  Actions: Read and write
  Metadata: Read-only (자동 포함)
```

토큰은 소스, GitHub Secret, 브라우저 `localStorage`에 저장하지 않고 Scheduler Worker의 Cloudflare Secret에만 등록한다.

```powershell
npx wrangler secret put GITHUB_ACTIONS_TOKEN --config wrangler.scheduler.toml
```

## 5. 배포

```powershell
npx wrangler deploy --config wrangler.scheduler.toml
```

배포 후 Worker 상태 주소의 `/health`를 열어 다음을 확인한다.

```json
{
  "status": "ready",
  "repositoryConfigured": true,
  "tokenConfigured": true
}
```

Cron 변경은 Cloudflare 글로벌 네트워크에 반영되는 데 최대 15분 정도 걸릴 수 있다.

## 6. 시험 및 전환 절차

1. Scheduler Worker를 배포하고 `/health`가 `ready`인지 확인한다.
2. Cloudflare 대시보드의 Cron Trigger 테스트 실행을 사용한다.
3. GitHub Actions에 `workflow_dispatch` 실행 기록이 생성되는지 확인한다.
4. 수집 성공 및 GitHub 데이터 커밋을 확인한다.
5. Cloudflare 운영 JSON의 최종 갱신 시각을 확인한다.
6. 이 모든 항목이 성공한 후에만 GitHub `schedule` 설정을 제거한 소스를 배포한다.

## 7. 보안 규칙

- `GITHUB_ACTIONS_TOKEN`은 Worker Secret에만 보관한다.
- 토큰은 `TrafficCatcher` 저장소의 Actions 실행 외 권한을 주지 않는다.
- Worker 로그에는 토큰, Authorization 헤더, GitHub 응답 헤더를 기록하지 않는다.
- 공개 `/health`는 토큰 값이 아닌 설정 여부만 반환한다.
- GitHub 워크플로의 `concurrency` 그룹을 유지해 동시 수집과 중복 커밋을 방지한다.
