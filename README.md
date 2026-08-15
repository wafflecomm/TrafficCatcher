# 📈 Traffic Catcher
> **실시간 포털 트렌드, 인기 주식 및 시그널(Signal) 실검 자동화 모니터링 시스템**

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
        A2[GitHub Actions Cron Job] -->|Every 1 Hour| B2[Python Crawler Script]
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
2.  **4대 포털 교차 유사도 분석 및 실시간 통합 핫이슈 (Cross Trending)**
    *   4대 포털(시그널, 다음, 네이트, 줌) 데이터를 실시간 형태소 토큰 분석하여 2개 이상 포털에서 동시 급상승 중인 키워드를 자동 탐지합니다.
    *   포털 일치 개수에 따라 `⚡ 2사 일치`, `🔥 3사 일치`, `👑 4사 올킬` 그라디언트 뱃지를 부여하고, 마우스 호버 시 타 포털의 일치 키워드가 동시에 네온 글로우로 발광하는 인터랙티브 효과를 제공합니다.
3.  **🤖 AI 블로그 포스팅 원고 & 쇼츠 4컷(9:16) 삽화 프롬프트 원스톱 생성 스튜디오 (블로그 수익화 & SEO 마스터)**
    *   **Role & Objective**: `skills/google-ai-studio-system-instructions.md`를 탑재하여 네이버/구글 SEO 상위 노출, 체류 시간 극대화 및 광고 수익(애드센스/애드포스트)을 최적화하는 수석 카피라이터 AI 에이전트.
    *   **💖 인플루언서 톤앤매너 & 1,500자~2,000자 이상 고밀도 분량**: `"이웃님들, 반가워요! 💖"` 통통 튀는 구어체와 풍부한 이모지(Emoji), 6하원칙 사건 경위와 타임라인 전개.
    *   **💰 3대 광고 수익 최적화 배치 설계**: 제목 아래(1), 상세 비교표 아래(2), 결론 직전(3) 전략적 광고 슬롯 자동 설계.
    *   **[Step 1] 키워드 속성 판별**: 이슈/트렌드형, 정보/스테디형, 리뷰/상업형 서사 템플릿 자동 분류.
    *   **[Step 2] 3대 관점 교차 분석 표**: 현안 중심, 파급 효과, 심층 분석 3가지 관점의 객관적 비교 대조 표(Table) 자동 생성.
    *   **[Step 3] 네이버 블로그 복사-붙여넣기 템플릿**: 클릭률 높은 추천 제목 3선, 3초 팩트 요약, H1~H3 구조화 본문, 에디터 공감 코멘트, 추천 태그 8~10개 일괄 출력.
    *   **[Step 4] 9:16 세로형 쇼츠/릴스 연동 4컷 삽화 프롬프트**: 1컷(긴급 속보 훅 0~2초), 2컷(사건 경위 팩트 3~5초), 3컷(핵심 해설 6~8초), 4컷(피날레/CTA 9~12초) 한글 및 Imagen 3 영문 프롬프트 생성.
4.  **연관 금융 정보 수집**
    *   **줌 인기 주식**: 줌 포털 증권 서비스에서 검색량과 조회수가 가장 높은 인기 급상승 주식 종목 25개의 시세, 코드명, 등락률 데이터를 수집합니다.
5.  **데이터 무중단 누적 및 내보내기**
    *   수집할 때마다 수집 시점의 타임스탬프를 포함해 `realtime_trends.csv` 파일에 계속해서 데이터를 누적(Append)합니다.
    *   시그널(Signal)의 경우, 전용 요구사항 규격을 충족하는 독립형 파일인 **`signal_realtime_keywords.csv`** 파일에 추가로 분할 누적 저장됩니다.
    *   엑셀에서 한글이 깨지는 현상을 완벽 방지하기 위해 UTF-8 with BOM (`utf-8-sig`) 인코딩으로 저장됩니다.
    *   배포 플랫폼을 위한 초경량 `trends.json` 정적 캐시 데이터도 실시간 동기화합니다.
6.  **IP 차단 우회 및 예외 처리**
    *   서버 부하 및 비정상 접근 오인 차단을 막기 위해 요청당 0~1.5초 사이의 무작위 딜레이(`random_delay`)를 삽입하고 브라우저 `User-Agent` 헤더를 설정합니다.
    *   특정 포털의 점검이나 개편으로 수집이 막혀도 다른 포털의 수집은 멈추지 않는 상호 독립형 예외 처리 구조를 가집니다.
7.  **하이브리드 2-Way 데이터 조회 최적화**
    *   대시보드가 실행 환경을 자동 감지하여, 로컬 Flask 웹앱 구동 시에는 실시간 비동기 `/api/trends` 및 `/api/generate_content` 스캔 백엔드와 연계되고, Cloudflare Pages 호스팅 환경에서는 깃허브 액션이 정적 배포한 `/trends.json` 캐시 데이터베이스와 클라이언트 사이드 고밀도 AI 제너레이터로 즉시 동작하도록 설계되었습니다.

---

## 🛠️ 기술 스택 (Technology Stack)

*   **Language**: Python 3.x, JavaScript (ES6+)
*   **AI & Content Engine**: 4-Step SEO Rule-based & Prompt Engineering Engine, Imagen 3 Prompt Formatter
*   **Libraries**:
    *   `requests` (네트워크 HTTP 요청)
    *   `BeautifulSoup4` (HTML 정적 DOM 파싱)
    *   `pandas` (데이터 가공 및 CSV 익스포트)
    *   `flask` (로컬 웹 REST API 서버 구동)
*   **Hosting & CI/CD**: Cloudflare Pages, GitHub Actions (1시간 주기 스케줄러)
*   **Design**: HTML5, Vanilla CSS3 (HSL 디자인 시스템, 9:16 스토리보드 뷰어, 반응형 레이아웃)

---

## 🚀 사용 설명서 (Usage Guide)

### 모드 A: 로컬 웹 서버로 사용하기 (Local Dashboard)
로컬 컴퓨터에서 웹 서버를 띄워 브라우저를 통해 실시간 수집을 즉시 테스트하고 싶을 때 사용합니다.
1.  **의존성 패키지 설치**
    ```bash
    pip install flask requests beautifulsoup4 pandas lxml
    ```
2.  **서버 구동** (기동 즉시 1회 초기 수집 후 1시간 간격 자동 반복)
    ```bash
    python portal_crawler.py --web
    ```
---

### 모드 B: 클라우드 서버리스로 사용하기 (GitHub Actions & Cloudflare Pages)
컴퓨터를 켜놓지 않아도 전 세계 어디서든 24시간 도메인을 통해 1시간마다 자동 갱신되는 대시보드를 사용할 때 세팅합니다.
1.  **저장소 깃허브 푸시**: 수정된 코드를 깃허브 리포지토리에 푸시합니다.
2.  **깃허브 Actions 쓰기 권한 활성화 (중요)**:
    *   깃허브 저장소 페이지의 **`Settings`** 탭 진입
    *   좌측 메뉴의 **`Actions`** -> **`General`** 클릭
    *   하단의 **`Workflow permissions`** 항목에서 **`Read and write permissions`** 선택 후 **`Save`**
3.  **Cloudflare Pages 연동**:
    *   [Cloudflare Dashboard](https://dash.cloudflare.com/) 진입 후 `Workers & Pages` -> `Create application` -> `Pages` -> `Connect to Git` 클릭.
    *   깃허브의 `TrafficCatcher` 저장소를 연동합니다.
    *   **Build settings** 설정 시, **Framework preset**은 `None`, **Build output directory**는 `.` (마침표 하나)로 입력 후 배포(Save and Deploy)합니다.
---

### 모드 C: 🤖 AI 블로그 & 쇼츠 4컷 스튜디오 사용하기 (AI Content Studio)
실시간으로 수집된 포털 트렌드 키워드를 기반으로 네이버 블로그 포스팅 원고와 쇼츠 4컷 삽화 프롬프트를 즉시 생성합니다.
1.  **실시간 키워드 원클릭 생성**: 대시보드 내 원하는 검색어 우측의 **`✍️ AI`** 버튼을 클릭합니다.
2.  **키워드 직접 입력 생성**: 상단 헤더의 **`🤖 AI 글작성 & 쇼츠 스튜디오`** 버튼을 눌러 모달을 연 뒤 검색어를 직접 입력합니다.
3.  **원스톱 복사 및 활용 (마크다운 & HTML 2개 양식 지원)**:
    *   **📋 마크다운(Markdown) 복사**: 노션, 벨로그, 깃허브, 티스토리 마크다운 모드용 순수 마크다운 텍스트를 클립보드에 복사합니다.
    *   **✨ 네이버 블로그 서식(HTML) 복사**: 네이버 스마트에디터(SmartEditor ONE)에 `Ctrl+V` 시 제목, 표(Table), 인용구, 볼드체 서식이 100% 살아있는 상태로 즉시 삽입되도록 Rich HTML 서식으로 복사합니다.
    *   **🏷️ HTML 코드 복사**: 웹사이트 게시 및 HTML 직접 삽입용 소스 코드를 복사합니다.
    *   **🎬 쇼츠/릴스 4컷 탭**: 9:16 세로형 4컷 스토리보드(속보 훅, 사건 경위 팩트, 핵심 해설, CTA)를 확인하고 **`📋 Imagen 3 프롬프트 복사`**를 눌러 이미지 생성 AI에 입력합니다.

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
