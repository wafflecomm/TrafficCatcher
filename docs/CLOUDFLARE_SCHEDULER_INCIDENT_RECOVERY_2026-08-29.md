# Traffic Catcher Cloudflare Scheduler 장애 원인 및 복구 가이드

- 문서 작성일: 2026-08-29
- 대상 서비스: Traffic Catcher 운영 서버
- 운영 주소: https://trafficcatcher.pages.dev/
- Cloudflare Worker: `trafficcatcher-scheduler`
- 실시간 워크플로: `Crawl Portal Trends and Upload` (`crawl_and_deploy.yml`)

## 1. 문서 목적

운영 서버의 실시간 데이터 수집이 멈췄을 때 원인을 빠르게 구분하고, 같은 장애를 5~15분 안에 복구할 수 있도록 실제 장애 사례와 복구 절차를 정리한다.

## 2. 장애 현상

운영 화면의 데이터 수집 완료 시각이 다음 값에서 더 이상 갱신되지 않았다.

> 데이터 수집 완료: 2026-08-28 16:53:18

Cloudflare의 `/api/trends`와 데이터 상태 API를 확인했을 때도 실시간 데이터의 마지막 저장 시각이 화면 표시와 같았다. 따라서 브라우저 캐시나 화면 표시 오류가 아니라, 운영 저장소에 들어가는 실시간 데이터 자체가 멈춘 상태였다.

반면 시즌·문화 데이터는 이후에도 갱신되고 있었다. 이 사실로 다음 항목은 정상이라고 판단할 수 있었다.

- 운영 웹페이지와 정적 파일 제공
- Cloudflare KV/R2 저장소 접근
- 일일·정기 데이터 수집 경로의 일부

## 3. 확정된 원인

Cloudflare Cron Trigger는 실행되고 있었지만 Worker에 전달된 실제 Cron 값은 다음과 같았다.

```text
0,30 0-14,21-23 * * *
```

당시 배포된 `cloudflare-scheduler/worker.js`는 아래 값을 실시간 수집 일정으로 정확히 일치 비교하고 있었다.

```text
*/10 * * * *
```

Worker의 일정 매핑은 `SCHEDULES[controller.cron]` 방식이므로 문자열이 정확히 같지 않으면 등록되지 않은 일정으로 판단한다. 실제 Observability 로그에는 다음 상태가 기록됐다.

```json
{
  "cron": "0,30 0-14,21-23 * * *",
  "event": "unknown_cron",
  "level": "warn"
}
```

결과적으로 Cloudflare에서는 Scheduled Event 실행이 성공한 것처럼 보였지만, Worker는 GitHub Actions를 호출하기 전에 종료됐다. 그래서 GitHub의 `Crawl Portal Trends and Upload`에는 2026-08-28 16:53 이후 자동 실행 기록이 생성되지 않았다.

### 중요한 구분

확정된 직접 원인은 **Cloudflare가 전달한 Cron 문자열과 Worker가 인식하는 Cron 문자열의 불일치**다.

이전 Cron 값이 계속 전달된 배경은 다음 중 하나일 가능성이 높지만, 로그만으로 어느 하나를 단정할 수는 없다.

- 이전 Cron Trigger 설정이 Cloudflare 내부에 남아 있었음
- Trigger 변경 또는 Worker 재배포 과정에서 설정 반영이 어긋남
- 대시보드 표시값과 실제 Scheduled Event 값의 전파 시점이 달랐음

## 4. 원인 분리 과정

### 4.1 운영 데이터 상태 확인

운영 화면의 마지막 수집 시각과 Cloudflare KV의 마지막 갱신 시각이 동일했다. 이 단계에서 화면 캐시 문제를 제외했다.

### 4.2 GitHub Actions 실행 기록 확인

`Crawl Portal Trends and Upload`가 마지막 정상 시각 이후 실행되지 않았다. 실패한 실행이 쌓인 것이 아니라 실행 기록 자체가 없었으므로, 크롤러 내부 오류보다 예약 호출 구간을 먼저 의심했다.

### 4.3 수동 워크플로 실행

GitHub Actions에서 `Run workflow`를 실행했고 정상적으로 완료됐다. 이 결과로 다음 요소가 정상임을 확인했다.

- `portal_crawler.py --realtime-only`
- GitHub Actions 실행 환경
- Cloudflare 데이터 업로드 스크립트
- 운영 저장소 업로드 인증값
- KV/R2 저장 및 운영 페이지 반영

즉, 장애 범위는 **Cloudflare Scheduler → GitHub workflow_dispatch 호출 전 단계**로 좁혀졌다.

### 4.4 Cloudflare Observability 확인

`trafficcatcher-scheduler`의 Observability 이벤트에서 `unknown_cron`과 실제 Cron 문자열을 확인해 원인을 확정했다.

## 5. 실제 복구 절차

### 5.1 서비스 데이터를 즉시 복구

1. GitHub 저장소를 연다.
2. `Actions`를 선택한다.
3. `Crawl Portal Trends and Upload`를 선택한다.
4. `Run workflow`를 실행한다.
5. 실행이 성공하면 운영 페이지를 새로고침한다.
6. `데이터 수집 완료` 시각이 최신으로 바뀌었는지 확인한다.

이 단계는 예약 실행을 고치기 전에도 사용자에게 최신 데이터를 먼저 제공하기 위한 응급 복구다.

### 5.2 Cloudflare Cron Trigger 재등록

1. Cloudflare Dashboard에 접속한다.
2. `Workers & Pages`를 선택한다.
3. Worker 목록에서 `trafficcatcher-scheduler`를 선택한다.
4. `Settings` → `Trigger events` → `Cron triggers`로 이동한다.
5. 기존 `Every 10 minutes` Trigger를 삭제한다.
6. `+ Add`를 눌러 아래 값을 정확히 등록한다.

```text
*/10 * * * *
```

7. 시즌·문화·OTT 수집 Trigger는 그대로 유지한다.

```text
30 1,5,9,13,21 * * *
```

8. Cloudflare 전파를 위해 최대 15분 정도 기다린다.

> Cloudflare Cron은 UTC 기준이다. `*/10 * * * *`는 시간대와 관계없이 24시간 매 10분 실행된다.

## 6. 복구 완료 확인

다음 네 항목을 모두 확인하면 정상 복구로 판단한다.

- GitHub Actions에 수동 실행이 아닌 새 자동 실행이 생긴다.
- `Crawl Portal Trends and Upload`가 성공한다.
- Cloudflare Observability에서 `cron` 값이 `*/10 * * * *`로 보인다.
- 운영 페이지의 `데이터 수집 완료` 시각이 주기적으로 갱신된다.

정상 로그의 핵심 이벤트는 다음과 같다.

```text
workflow_dispatched
```

다음 경고가 다시 발생하면 아직 복구되지 않은 것이다.

```text
unknown_cron
```

## 7. 재발 시 5분 진단표

| 확인 결과 | 의미 | 다음 조치 |
|---|---|---|
| 운영 시각만 오래됐고 GitHub 자동 실행 기록이 없음 | Scheduler 호출 문제 | Cloudflare Observability 확인 |
| Observability에 `unknown_cron` | Cron 문자열 불일치 | Trigger 삭제 후 정확한 값으로 재등록 |
| `workflow_dispatch_failed`와 HTTP 401/403 | GitHub 토큰 또는 권한 문제 | `GITHUB_ACTIONS_TOKEN` 재발급·재등록 |
| GitHub 자동 실행은 있으나 실패 | 크롤러 또는 업로드 단계 문제 | 해당 Actions 실패 로그 확인 |
| GitHub 수동 실행 성공 | 크롤러·업로드는 정상 | Scheduler/Trigger만 집중 점검 |
| GitHub 수동 실행도 실패 | Scheduler 외 문제 | Actions 실패 단계부터 수정 |
| Actions 성공, 운영 시각은 그대로 | 업로드·KV/R2 반영 문제 | 업로드 로그와 `/api/data/status` 확인 |

## 8. Cloudflare에서 확인할 위치

### Cron Trigger 설정

```text
Workers & Pages
→ trafficcatcher-scheduler
→ Settings
→ Trigger events
→ Cron triggers
```

### 실행 로그

```text
Workers & Pages
→ trafficcatcher-scheduler
→ Observability
→ Events 또는 Logs
```

최근 24시간 또는 7일로 조회하고 다음 값을 검색한다.

- `unknown_cron`
- `workflow_dispatched`
- `workflow_dispatch_failed`
- `401`, `403`, `404`, `429`, `500`

## 9. GitHub 인증 오류가 발생할 때

`unknown_cron`이 아니라 `workflow_dispatch_failed`가 기록되고 HTTP 401 또는 403이 표시되면 Cloudflare의 GitHub 인증 Secret을 확인한다.

필수 설정:

- `GITHUB_OWNER`
- `GITHUB_REPOSITORY`
- `GITHUB_REF`
- Secret `GITHUB_ACTIONS_TOKEN`

토큰 값은 로그, 문서, GitHub 소스에 절대 기록하지 않는다. 토큰을 새로 만들었다면 Cloudflare Worker의 Variables and secrets에서 `GITHUB_ACTIONS_TOKEN`만 교체한다.

## 10. 재발 방지 권장 사항

### 우선 적용 권장

1. Worker 배포 후 Cron Trigger 두 개가 유지되는지 확인한다.
2. 배포 직후 Observability에서 실제 `controller.cron` 값을 확인한다.
3. 운영 화면의 마지막 수집 시각이 기준 주기의 2배 이상 오래되면 경고를 표시한다.
4. `unknown_cron` 발생 시 관리자에게 알림을 보내도록 한다.

### 소스 보강 권장

현재 코드는 Cron 문자열을 정확히 비교한다. 운영 안정성을 높이려면 다음 중 하나를 적용한다.

- 이전 실시간 Cron 값도 임시 호환 목록으로 인식
- 알 수 없는 Cron 발생 시 조기 종료만 하지 말고 운영 알림 전송
- GitHub Actions 자체 `schedule`을 보조 경로로 추가해 이중화
- 마지막 정상 dispatch 시각을 KV/D1에 기록하고 관리자 화면에 표시

단, 호환 Cron을 무제한 허용하면 의도하지 않은 수집이 실행될 수 있으므로 명시적으로 승인된 값만 등록해야 한다.

## 11. 현재 정상 운영 기준값

`cloudflare-scheduler/worker.js`와 `wrangler.scheduler.toml`의 기준값은 다음과 같다.

| 구분 | Cron | GitHub 워크플로 |
|---|---|---|
| 실시간 포털·방송 데이터 | `*/10 * * * *` | `crawl_and_deploy.yml` |
| 시즌·문화·OTT 데이터 | `30 1,5,9,13,21 * * *` | `crawl_daily_discovery.yml` |

## 12. 한 줄 복구 요약

> GitHub 워크플로를 수동 실행해 데이터를 먼저 복구한 뒤, Cloudflare Observability에서 실제 Cron 값을 확인하고 `unknown_cron`이면 실시간 Trigger를 `*/10 * * * *`로 삭제·재등록한다.