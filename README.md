# 📈 Traffic Catcher
> **실시간 포털 트렌드 및 주식 정보 자동화 모니터링 시스템**

포털 사이트(네이트, 다음, 줌) 및 네이버 실검 대체 서비스인 **시그널(Signal.bz)**의 실시간 급상승 키워드와 인기 주식 정보를 수집하고 가공하여 사용자에게 시각적으로 서빙해주는 자동화 크롤러 대시보드 시스템입니다.

---

## 🎨 아키텍처 다이어그램 (Architecture)

본 시스템은 사용 환경에 따라 두 가지 모드로 실행할 수 있는 하이브리드 아키텍처를 가집니다.

```mermaid
graph TD
    subgraph 1. Local Run Mode (Flask Server)
        A1[Developer Run] -->|python portal_crawler.py --web| B1[Flask Web Server]
        B1 -->|REST API| C1[BeautifulSoup & API Crawlers]
        C1 -->|Nate/Daum/Zum/Signal| D1[Portal & API Servers]
        C1 -->|Save & Update| E1[(realtime_trends.csv & signal_realtime_keywords.csv)]
    end

    subgraph 2. Cloud Serverless Mode (GitHub Actions & Cloudflare)
        A2[GitHub Actions Cron Job] -->|Every 30 Minutes| B2[Python Crawler Script]
        B2 -->|Fetch Data| C2[Portal & API Servers]
        B2 -->|Save & Export| D2[(realtime_trends.csv, trends.json, signal_realtime_keywords.csv)]
        D2 -->|Auto Commit & Push| E2[GitHub Repository]
        E2 -->|Webhook Trigger| F2[Cloudflare Pages]
        F2 -->|Static Hosting| G2[User Web Browser]
    end
```

---

## ✨ 핵심 기능 (Features)

1.  **실시간 이슈 및 트렌드 키워드 수집**
    *   **네이트 (Nate)**: 메인 페이지의 HTML 구조를 분석해 최근 뉴스 주목 키워드(Top 5) 수집.
    *   **다음 (Daum)**: 모바일 버전 다음 페이지를 분석해 10분 단위 급상승 트렌드 키워드(Top 10) 및 순위 변동 지표 수집.
    *   **줌 (Zum)**: Next.js 직렬화 스트림 데이터를 정밀 JSON 해독하여 실시간 인기 검색어(Top 10) 수집.
    *   **시그널 (Signal)**: `signal.bz` 의 내부 비공식 백엔드 API인 `https://api.signal.bz/news/realtime`을 다이렉트로 호출하여 실시간 트렌드 키워드(Top 10)를 정밀 JSON 수집. (HTML 구조 변경에도 무너지지 않는 강력한 성능 보유)
2.  **연관 금융 정보 수집**
    *   **줌 인기 주식**: 줌 포털 증권 서비스에서 검색량과 조회수가 가장 높은 인기 급상승 주식 종목 25개의 시세, 코드명, 등락률 데이터를 수집합니다.
3.  **데이터 무중단 누적 및 내보내기**
    *   수집할 때마다 수집 시점의 타임스탬프를 포함해 `realtime_trends.csv` 파일에 계속해서 데이터를 누적(Append)합니다.
    *   시그널(Signal)의 경우, 전용 요구사항 규격을 충족하는 독립형 파일인 **`signal_realtime_keywords.csv`** 파일에 추가로 분할 누적 저장됩니다.
    *   엑셀에서 한글이 깨지는 현상을 완벽 방지하기 위해 UTF-8 with BOM (`utf-8-sig`) 인코딩으로 저장됩니다.
    *   배포 플랫폼을 위한 초경량 `trends.json` 정적 캐시 데이터도 실시간 동기화합니다.
4.  **IP 차단 우회 및 예외 처리**
    *   서버 부하 및 비정상 접근 오인 차단을 막기 위해 요청당 0~1.5초 사이의 무작위 딜레이(`random_delay`)를 삽입하고 브라우저 `User-Agent` 헤더를 설정합니다.
    *   특정 포털의 점검이나 개편으로 수집이 막혀도 다른 포털의 수집은 멈추지 않는 상호 독립형 예외 처리 구조를 가집니다.

---

## 🛠️ 기술 스택 (Technology Stack)

*   **Language**: Python 3.x
*   **Libraries**:
    *   `requests` (네트워크 HTTP 요청)
    *   `BeautifulSoup4` (HTML 정적 DOM 파싱)
    *   `pandas` (데이터 가공 및 CSV 익스포트)
    *   `flask` (로컬 웹 REST API 서버 구동)
*   **Hosting & CI/CD**: Cloudflare Pages, GitHub Actions (스케줄러)
*   **Design**: HTML5, Vanilla CSS3 (HSL 컬러, 반응형 가변 레이아웃)

---

## 🚀 사용 설명서 (Usage Guide)

### 모드 A: 로컬 웹 서버로 사용하기 (Local Dashboard)
로컬 컴퓨터에서 웹 서버를 띄워 브라우저를 통해 실시간 수집을 즉시 테스트하고 싶을 때 사용합니다.
1.  **의존성 패키지 설치**
    ```bash
    pip install flask requests beautifulsoup4 pandas lxml
    ```
2.  **서버 구동**
    ```bash
    python portal_crawler.py --web
    ```
3.  **브라우저 확인**: 웹 브라우저를 열고 `http://127.0.0.1:5000` 에 접속한 후 우측 상단의 `실시간 수집 실행` 버튼을 눌러 모니터링을 진행합니다.

---

### 모드 B: 클라우드 서버리스로 사용하기 (Cloudflare Pages)
컴퓨터를 켜놓지 않아도 전 세계 어디서든 24시간 도메인을 통해 자동 갱신되는 대시보드를 사용할 때 세팅합니다.
1.  **저장소 깃허브 푸시**: 본 코드를 본인의 깃허브 리포지토리에 푸시합니다.
2.  **Cloudflare Pages 연동**:
    *   [Cloudflare Dashboard](https://dash.cloudflare.com/) 진입 후 `Workers & Pages` -> `Create application` -> `Pages` -> `Connect to Git` 클릭.
    *   깃허브의 `TrafficCatcher` 저장소를 연동합니다.
    *   **Build settings** 설정 시, **Framework preset**은 `None`, **Build output directory**는 `.` (마침표 하나)로 입력 후 배포(Save and Deploy)합니다.
3.  **동작 확인**: 제공되는 전용 주소(`https://[이름].pages.dev`)에 접속하면, 깃허브 액션이 30분 마다 백그라운드에서 크롤링한 최신 트렌드 결과물이 자동으로 동적 반영됩니다.

---

## 📊 데이터 저장 스키마 명세

### 1. 통합 수집 로그 (`realtime_trends.csv`)

| 컬럼명 | 데이터 형태 | 예시 값 | 설명 |
| :--- | :--- | :--- | :--- |
| **Timestamp** | String (DateTime) | `2026-08-15 17:26:23` | 데이터를 크롤링하여 저장한 시각 |
| **Site** | String | `Nate` / `Daum` / `Zum_Keyword` / `Zum_Stock` / `Signal` | 데이터 수집 대상 사이트명 구분 |
| **Rank** | Integer | `1` ~ `25` | 각 포털 사이트 내 트렌드/주식 순위 |
| **Keyword** | String | `기아` / `LG 존 케네디 영입` | 검색어 키워드 또는 수집된 주식 종목명 |
| **Detail** | String | `상승` / `코드: 000270 \| 현재가: 141,700원...` | 변동 정보(상승/하락 등) 또는 주식 시세 상세 텍스트 |

### 2. 시그널 전용 로그 (`signal_realtime_keywords.csv`)

| 컬럼명 | 데이터 형태 | 예시 값 | 설명 |
| :--- | :--- | :--- | :--- |
| **Timestamp** | String (DateTime) | `2026-08-15 18:23:03` | 데이터를 크롤링하여 저장한 시각 |
| **Rank** | Integer | `1` ~ `10` | 시그널 실시간 인기 검색어 순위 |
| **Keyword** | String | `LG 존 케네디 영입` | 실시간 인기 검색어명 |
