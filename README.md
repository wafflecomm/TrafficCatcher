# 📈 Traffic Catcher
> **실시간 4대 포털 트렌드, 인기 주식 모니터링 & Google AI Studio 블로그 수익화 자동화 시스템**

포털 사이트(네이트, 다음, 줌) 및 네이버 실검 대체 서비스인 **시그널(Signal.bz)**의 실시간 급상승 키워드와 인기 주식 정보를 수집하고 가공하여, **Google AI Studio (Gemini 2.5 Flash)** 및 구글/유튜브 실시간 팩트 검색과 연동해 **1,500~2,000자 이상의 고품질 파워블로거 완성 기사**와 **쇼츠(9:16) 4컷 스토리보드**를 자동 창작해 주는 올인원 대시보드 시스템입니다.

---

## 🎨 아키텍처 다이어그램 (Architecture)

본 시스템은 로컬 환경과 클라우드 환경(Cloudflare Pages)에서 모두 완벽하게 동작하는 하이브리드 아키텍처를 가집니다.

```mermaid
graph TD
    subgraph 1. Local Run Mode (Flask Server & Python Engine)
        A1[Developer Run] -->|python portal_crawler.py --web| B1[Flask Web Server]
        B1 -->|REST API| C1[BeautifulSoup & API Crawlers]
        C1 -->|Nate/Daum/Zum/Signal| D1[Portal & API Servers]
        C1 -->|Save & Update| E1[(realtime_trends.csv, trends.json)]
        B1 -->|ai_studio_code.py| F1[Google AI Studio Gemini 2.5 Flash]
    end

    subgraph 2. Cloud Serverless Mode (GitHub Actions & Cloudflare Pages)
        A2[GitHub Actions Cron Job] -->|Every 1 Hour| B2[Python Crawler Script]
        B2 -->|Fetch Data| C2[Portal & API Servers]
        B2 -->|Auto Commit & Push| D2[GitHub Repository]
        D2 -->|Webhook Trigger| E2[Cloudflare Pages Static Hosting]
        E2 -->|Live Portal Crawler & RSS| F2[User Web Browser]
        F2 -->|Client-Side REST API| G2[Google Gemini 2.5 Flash API]
    end

    subgraph 3. System Instructions Single Source of Truth
        S1[skills/google-ai-studio-system-instructions.md] -->|Dynamic Loader| F1
        S1 -->|Synchronized System Instruction| F2
    end
```

---

## ✨ 핵심 기능 (Features)

### 1. 📊 실시간 4대 포털 이슈 및 트렌드 키워드 수집
* **시그널 (Signal)**: `api.signal.bz/news/realtime` 내부 API를 직접 호출하여 실시간 트렌드 키워드(Top 10)를 정밀 JSON 수집.
* **다음 (Daum)**: 10분 단위 급상승 트렌드 키워드(Top 10) 및 순위 변동 지표 수집.
* **네이트 (Nate)**: 메인 페이지 HTML 구조를 분석해 최근 뉴스 주목 키워드(Top 10) 수집.
* **줌 (Zum)**: Next.js 직렬화 데이터를 정밀 해독하여 실시간 급상승 키워드(Top 10) 수집.
* **줌 인기 주식 (Top 25)**: 줌 포털 증권 섹션에서 검색량과 조회수가 가장 높은 실시간 급상승 종목 25개의 종목코드, 현재가, 등락률 수집.

### 2. 🔥 4대 포털 교차 유사도 분석 및 통합 핫이슈 (Cross Trending)
* 4대 포털 데이터를 형태소 토큰 단위로 실시간 분석하여 2개 이상 포털에서 동시 급상승 중인 키워드를 자동 탐지합니다.
* 포털 일치 개수에 따라 `⚡ 2사 일치`, `🔥 3사 일치`, `👑 4사 올킬` 그라디언트 뱃지를 부여하고, 마우스 호버 시 타 포털의 일치 키워드가 동시에 네온 글로우로 발광하는 인터랙티브 효과를 제공합니다.

### 3. 🤖 Google AI Studio 기반 블로그 수익화 & SEO 마스터 스튜디오
* **역할 (Persona)**: 네이버/구글 SEO 상위 노출, 체류 시간 극대화 및 광고 수익(애드센스/애드포스트)을 최적화하는 수석 블로그 마케팅 전문가이자 인기 인플루언서.
* **Single Source of Truth 동기화 구조**: `skills/google-ai-studio-system-instructions.md` 마크다운 파일을 수정하면, `ai_studio_code.py`의 `SYSTEM_INSTRUCTION` 및 웹 프론트엔드(`index.html`)가 **실시간으로 100% 동일하게 자동 동기화**되어 일관성을 완벽히 유지합니다.
* **키워드 속성 3대 자동 판별 (`detect_keyword_type`)**:
  * **① 이슈/트렌드형 (`TREND`)**: 실시간 속보, 연예, 사회적 이슈 맞춤 오프닝 및 파급 효과 분석.
  * **② 정보/스테디형 (`INFO`)**: 방법, 신청, 일정, 세금, 지원금 등 맞춤 체크리스트 및 실전 꿀팁.
  * **③ 리뷰/상업형 (`REVIEW`)**: 후기, 가격, 스펙, 비교, 장단점 등 솔직 담백한 구매 가이드.
* **1+ 적응형 팩트 합성 (1+ Adaptive Synthesis)**:
  * 실시간 구글 뉴스 및 유튜브 영상에서 수집된 팩트 출처가 **1개만 있어도, 2개 또는 3개가 있어도** 1,500자~2,000자 이상의 꽉 찬 고품질 원고로 자동 재구성.
* **💰 3대 전략적 광고 수익 최적화 배치 설계**:
  * `[광고 삽입 포인트 1]`: 제목 아래 1단락 후 (요약 직후)
  * `[광고 삽입 포인트 2]`: 상세 비교표(Table) 아래 본문 중반
  * `[광고 삽입 포인트 3]`: 에디터 코멘트 직전 하단
* **📄 완벽한 출력 템플릿**:
  * 클릭률 높은 추천 제목 3선
  * 3초 팩트 요약
  * 3대 관점(현안 중심 / 파급 효과 / 심층 분석) 비교 분석 표(Table)
  * 에디터 한 줄 코멘트 및 소통 마무리
  * **🔗 실시간 참고 보도 및 팩트 출처 (Fact Sources)**: 결론 직후 하단에 깔끔하게 링크 표시
  * 추천 태그 8~10개
* **🎬 쇼츠/릴스(9:16) 4컷 스토리보드 & Imagen 3 프롬프트**:
  * 1컷(긴급 속보 훅 0~2초), 2컷(사건 경위 팩트 3~5초), 3컷(핵심 해설 6~8초), 4컷(피날레/CTA 9~12초) 한글 및 영어 프롬프트 자동 생성.

### 4. 🌐 전천후 클라이언트 사이드 실시간 라이브 크롤링 & 5단계 안전 로딩
* **클라우드 정적 호스팅(Cloudflare Pages) 환경 지원**:
  * `[⚡ 실시간 수집 실행]` 버튼 클릭 시 브라우저가 직접 시그널 API, 구글 트렌드 RSS, 포털 실시간 데이터를 1~2초 만에 라이브로 수집하여 즉시 화면을 갱신합니다.
* **5단계 다단계 안전 로딩 파이프라인**:
  * `1단계: trends.json` ➔ `2단계: 로컬 Flask API` ➔ `3단계: 브라우저 실시간 라이브 크롤링` ➔ `4단계: CSV 파싱` ➔ `5단계: 내장 기본 데이터 렌더링` (Zero-Empty 보장).

---

## 🛠️ 기술 스택 (Technology Stack)

* **Language**: Python 3.x, JavaScript (ES6+ / Node.js VM 검증 완료)
* **AI & LLM Engine**:
  * Google AI Studio **Gemini 2.5 Flash** (최신 권장 모델)
  * `google-genai` 최신 공식 SDK 및 REST API v1beta 동시 지원
  * Google Imagen 3 프롬프트 연동
* **Libraries & Frameworks**:
  * `requests`, `BeautifulSoup4`, `pandas`, `flask`, `lxml`
* **Hosting & CI/CD**:
  * Cloudflare Pages (정적 호스팅 및 배포)
  * GitHub Actions (1시간 주기 자동 크롤링 워크플로우)
* **Design**:
  * Vanilla CSS3 (HSL 디자인 시스템, 글래스모피즘, 9:16 스토리보드 뷰어, 반응형 레이아웃)

---

## 🚀 사용 설명서 (Usage Guide)

### 모드 A: 🌐 온라인 웹 대시보드 사용하기 (Cloudflare Pages)
* **접속 주소**: [https://trafficcatcher.pages.dev](https://trafficcatcher.pages.dev)
1. **실시간 트렌드 확인**: 4대 포털 실시간 키워드 및 Zum 인기 주식 25개 종목을 실시간 확인합니다.
2. **실시간 수집 실행**: 상단 헤더의 **`[⚡ 실시간 수집 실행]`** 버튼을 누르면 브라우저가 즉시 최신 4대 포털 데이터를 라이브로 수집하여 화면을 갱신합니다.
3. **AI 기사 작성**: 원하는 검색어 우측의 **`✍️ AI`** 버튼을 누르고 **`[⚡ 실시간 검색 & 기사 작성]`**을 클릭하면 1,500자 이상의 완성 기사가 자동 창작됩니다.
4. **Google AI Studio 연동 (선택사항)**:
   * [Google AI Studio](https://aistudio.google.com/app/apikey)에서 무료 API Key를 발급받아 모달 상단의 **`🔑 Google AI Studio 연동 설정`**에 입력하시면 최신 **Gemini 2.5 Flash**가 직접 실시간 창작합니다. (키는 브라우저 `localStorage`에만 안전 보관)

---

### 모드 B: 💻 로컬 개발 환경으로 사용하기 (Local Dashboard)
1. **의존성 패키지 설치**
   ```bash
   pip install flask requests beautifulsoup4 pandas lxml google-genai
   ```
2. **로컬 웹 서버 구동** (포털 크롤러 + 웹 대시보드)
   ```bash
   python portal_crawler.py --web
   ```
   브라우저에서 `http://localhost:5000`으로 접속합니다.

3. **Google AI Studio 독립 스크립트 실행**
   ```bash
   python ai_studio_code.py
   ```

---

### 모드 C: 📋 원스톱 복사 및 블로그 활용
* **✨ 네이버 블로그 서식(HTML) 복사**: 네이버 스마트에디터 ONE에 `Ctrl+V` 시 제목, 비교표, 인용구, 광고 슬롯 서식이 100% 살아있는 상태로 즉시 삽입됩니다.
* **📋 마크다운(Markdown) 복사**: 티스토리, 벨로그, 노션, 깃허브용 마크다운 원문을 복사합니다.
* **🏷️ HTML 코드 복사**: 웹사이트 게시용 순수 HTML 소스를 복사합니다.
* **🎬 쇼츠 4컷 탭**: 9:16 세로형 4컷 스토리보드 및 Imagen 3 영문 프롬프트를 원클릭 복사합니다.

---

## 📊 데이터 저장 스키마 명세

### 1. 통합 수집 로그 (`realtime_trends.csv`)

| 컬럼명 | 데이터 형태 | 예시 값 | 설명 |
| :--- | :--- | :--- | :--- |
| **Timestamp** | String (DateTime) | `2026-08-16 01:00:00` | 데이터를 크롤링하여 저장한 시각 |
| **Site** | String | `Nate` / `Daum` / `Zum_Keyword` / `Zum_Stock` / `Signal` | 데이터 수집 대상 사이트명 구분 |
| **Rank** | Integer | `1` ~ `25` | 각 포털 사이트 내 트렌드/주식 순위 |
| **Keyword** | String | `기아` / `LG 존 케네디 영입` | 검색어 키워드 또는 수집된 주식 종목명 |
| **Detail** | String | `상승` / `코드: 000270 \| 현재가: 141,700원...` | 변동 정보 또는 주식 시세 상세 텍스트 |

### 2. 시그널 전용 로그 (`signal_realtime_keywords.csv`)

| 컬럼명 | 데이터 형태 | 예시 값 | 설명 |
| :--- | :--- | :--- | :--- |
| **Timestamp** | String (DateTime) | `2026-08-16 01:00:00` | 데이터를 크롤링하여 저장한 시각 |
| **Rank** | Integer | `1` ~ `10` | 시그널 실시간 인기 검색어 순위 |
| **Keyword** | String | `LG 존 케네디 영입` | 실시간 인기 검색어명 |

---

## 📄 라이선스 (License)
© 2026 Traffic Catcher. All rights reserved.
