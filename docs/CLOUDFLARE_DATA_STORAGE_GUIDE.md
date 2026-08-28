# Traffic Catcher Cloudflare 데이터 저장소 전환 가이드

- 최종 갱신: 2026-08-28
- 목적: 데이터 갱신과 Pages 소스 배포를 분리하고, 24시간 10분 주기 수집 결과를 Cloudflare에서 즉시 제공한다.

## 1. 저장 구조

```text
Cloudflare Cron (실시간 24시간 매 10분)
        ↓ workflow_dispatch
GitHub Actions Python 수집기
        ↓ 인증된 PUT
trafficcatcher.ai/api/data/ingest/<파일명>
        ├─ Workers KV: 화면용 최신 JSON
        └─ R2: 최신 원본 JSON·CSV
        ↓
운영 웹페이지: /api/trends 등 Worker API 우선 조회
        ↓ 장애 시
배포본의 정적 JSON 폴백
```

데이터 커밋이 발생하지 않으므로 수집 주기와 Cloudflare Pages 배포 횟수가 분리된다. GitHub에는 소스와 문서만 저장한다.

## 2. Cloudflare 리소스 생성

Cloudflare Dashboard에서 다음 리소스를 만든다.

1. **Workers KV** → namespace 이름 `trafficcatcher-live-data`
2. **R2 Object Storage** → bucket 이름 `trafficcatcher-data-archive`
3. **Workers & Pages** → `trafficcatcher` → Settings → Bindings
   - KV namespace binding: `TRAFFIC_DATA_KV`
   - R2 bucket binding: `TRAFFIC_DATA_ARCHIVE`
4. **Variables and Secrets**에 암호화 Secret `DATA_INGEST_TOKEN` 등록

바인딩 이름은 소스와 정확히 일치해야 한다. Production 환경과 Preview 환경의 바인딩은 별도이므로 운영용 Production에 반드시 등록한다.

## 3. 업로드 토큰 생성

PowerShell에서 32바이트 임의 토큰을 만든다. 아래 방식은 Windows PowerShell 5.1과 PowerShell 7에서 모두 동작한다.

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$token
```

프로젝트에 포함된 스크립트를 실행해도 동일한 64자리 토큰을 생성할 수 있다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate_ingest_token.ps1
```

출력된 동일한 값을 다음 두 곳에 Secret으로 등록한다.

- Cloudflare `trafficcatcher` 프로젝트: `DATA_INGEST_TOKEN`
- GitHub Repository → Settings → Secrets and variables → Actions: `TRAFFIC_DATA_INGEST_TOKEN`

토큰을 소스, 문서, 로그, 브라우저 저장소에 기록하지 않는다.

## 4. 저장 파일과 공개 API

| 수집 파일 | KV | R2 `latest/` | 공개 조회 API |
|---|---:|---:|---|
| `trends.json` | ✓ | ✓ | `/api/trends` |
| `broadcast_top5.json` | ✓ | ✓ | `/api/broadcast-top5` |
| `season_events.json` | ✓ | ✓ | `/api/season-events` |
| `movie_releases.json` | ✓ | ✓ | `/api/movie-releases` |
| `performances.json` | ✓ | ✓ | `/api/performances` |
| `netflix_top10.json` | ✓ | ✓ | `/api/netflix-top10` |
| `realtime_trends.csv` | - | ✓ | 비공개 원본 |
| `signal_realtime_keywords.csv` | - | ✓ | 비공개 원본 |

공개 API는 60초 브라우저 캐시와 5분 Cloudflare 캐시를 사용한다. 업로드가 완료되면 해당 데이터 API 캐시를 무효화한다.

## 5. 초기 데이터 이관

운영 Worker와 바인딩을 배포한 후 로컬 프로젝트에서 실행한다.

```powershell
$env:TRAFFIC_DATA_INGEST_URL = "https://trafficcatcher.ai"
$env:TRAFFIC_DATA_INGEST_TOKEN = "Cloudflare와 GitHub에 등록한 동일 토큰"
python scripts/upload_cloudflare_data.py --group realtime
python scripts/upload_cloudflare_data.py --group discovery
```

성공 로그에서 각 파일의 `KV=True`, `R2=True`를 확인한다. 이후 다음 주소를 확인한다.

```text
https://trafficcatcher.ai/api/data/status
https://trafficcatcher.ai/api/trends
https://trafficcatcher.ai/api/broadcast-top5
```

## 6. 점진적 전환과 롤백

GitHub Secret이 아직 없으면 업로드 스크립트는 종료 코드 2를 반환하고 워크플로는 기존 GitHub 데이터 커밋 방식으로 임시 폴백한다. KV·R2와 Secret 설정이 완료되면 업로드가 성공하고 GitHub 데이터 커밋 단계는 자동으로 건너뛴다.

장애 시 GitHub의 `TRAFFIC_DATA_INGEST_TOKEN` Secret을 잠시 제거하면 다음 실행부터 기존 커밋 방식이 다시 활성화된다. 운영 페이지도 Worker API 실패 시 배포본의 정적 JSON을 자동으로 사용한다.

## 7. 무료 한도 예상

- 실시간 수집: 144회/일
- 시즌·문화·OTT: 5회/일
- KV 쓰기: 약 308회/일
- R2 쓰기: 약 596회/일, 약 17,880회/월
- Pages 데이터 배포: 0회

현재 설계는 KV 무료 쓰기 1,000회/일과 R2 무료 Class A 100만 회/월 안에 들어온다. 방문자 증가 시 KV 읽기량은 Worker Cache API로 완화한다.
