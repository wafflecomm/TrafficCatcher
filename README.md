# 📈 Traffic Catcher
> **실시간 포털 트렌드, Gemini 뉴스 기사·쇼츠 생성, YouTube 공식 검색 및 AI 기사 보완 시스템**

포털 사이트(네이트, 다음, 줌)와 **시그널(Signal.bz)**의 실시간 키워드 및 인기 주식을 수집하고, 프로덕션 권장 Gemini 모델과 Google News RSS·YouTube Data API v3를 연동해 **1,500자 이상의 기사**와 **쇼츠(9:16) 4컷 스토리보드**를 만드는 반응형 대시보드입니다. 완성된 기사는 추가 요청을 반영해 Gemini가 전체 문맥 단위로 다시 보완할 수 있습니다.

- 운영 사이트: <https://trafficcatcher.pages.dev/>
- 로컬 주소: <http://127.0.0.1:5000>

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
        B1 -->|ai_studio_code.py| F1[Google AI Studio Gemini API]
    end

    subgraph 2. Cloud Serverless Mode (GitHub Actions & Cloudflare Pages)
        A2[GitHub Actions Cron Job] -->|Every 1 Hour| B2[Python Crawler Script]
        B2 -->|Fetch Data| C2[Portal & API Servers]
        B2 -->|Auto Commit & Push| D2[GitHub Repository]
        D2 -->|Webhook Trigger| E2[Cloudflare Pages Static Hosting]
        E2 -->|Live Portal Crawler & RSS| F2[User Web Browser]
        F2 -->|Client-Side REST API| G2[Gemini API + YouTube Data API v3]
    end

    subgraph 3. System Instructions Single Source of Truth
        S1[skills/google-ai-studio-keyword-article.md] -->|Dynamic Loader| F1
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
* **Single Source of Truth 동기화 구조**: `skills/google-ai-studio-keyword-article.md` 마크다운 파일을 수정하면, `ai_studio_code.py`의 `SYSTEM_INSTRUCTION` 및 웹 프론트엔드(`index.html`)가 **실시간으로 100% 동일하게 자동 동기화**되어 일관성을 완벽히 유지합니다.
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

### 5. 🔑 Gemini·YouTube API Key 분리 관리

* Gemini 기사 작성 키와 YouTube Data API v3 영상 검색 키를 각각 입력·저장·검증합니다.
* 두 키는 GitHub나 Cloudflare 소스에 기록하지 않고 현재 브라우저의 `localStorage`에만 저장합니다.
* Google 뉴스는 최대 3개, YouTube 공식 검색 결과는 네 번째 줄에 `🎥` 아이콘으로 표시합니다.
* 영상 검색 실패 시 API 활성화, 키 제한, 할당량 등 진단 원인을 표시합니다.

### 6. ✨ Gemini 기반 전체 기사 보완

* `AI로 기사 보완하기`는 입력 문장을 하단에 붙이지 않고 현재 기사 전체와 보완 요청을 Gemini가 다시 분석합니다.
* 빠진 정보, 수정할 사실, 강화할 관점을 기존 문맥에 자연스럽게 통합합니다.
* Google·YouTube 검색은 다시 실행하지 않으며 기존 Fact Sources를 유지합니다.
* 실패 시 원문을 보존하고 성공 후 `수정 전으로` 버튼으로 되돌릴 수 있습니다.

---

## 🛠️ 기술 스택 (Technology Stack)

* **Language**: Python 3.x, JavaScript (ES6+ / Node.js VM 검증 완료)
* **AI & LLM Engine**:
  * Google AI Studio 프로덕션 권장 Gemini Flash / Flash-Lite 모델
  * `google-genai` 최신 공식 SDK 및 REST API v1beta 동시 지원
  * YouTube Data API v3 `search.list`
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

### 네이버 블로그 로컬 발행 도우미

기사 작성이 끝난 뒤 `네이버 블로그로 보내기`를 사용하려면 프로젝트 폴더의 `실행_네이버블로그도우미.bat`을 먼저 실행합니다. 도우미는 `http://127.0.0.1:8765`에서만 동작하며 원고를 로컬 SQLite에 저장하고 네이버 글쓰기 화면을 엽니다.

네이버 계정 정보와 쿠키는 Traffic Catcher로 전송하지 않으며, 스마트에디터에 원고를 붙여넣은 뒤 최종 발행 또는 예약 발행은 사용자가 직접 확인합니다.

### 모드 A: 🌐 온라인 웹 대시보드 사용하기 (Cloudflare Pages)
* **접속 주소**: [https://trafficcatcher.pages.dev](https://trafficcatcher.pages.dev)
1. **실시간 트렌드 확인**: 4대 포털 실시간 키워드 및 Zum 인기 주식 25개 종목을 실시간 확인합니다.
2. **실시간 수집 실행**: 상단 헤더의 **`[⚡ 실시간 수집 실행]`** 버튼을 누르면 브라우저가 즉시 최신 4대 포털 데이터를 라이브로 수집하여 화면을 갱신합니다.
3. **AI 기사 작성**: Cross Trending의 **`✍️ AI 글쓰기`** 버튼 또는 포털 키워드 카드를 선택하고 **`[⚡ 초고속 실시간 기사 작성]`**을 누릅니다.
4. **Gemini 연동**: [Google AI Studio](https://aistudio.google.com/app/apikey)에서 발급한 키를 Gemini 전용 입력란에 저장합니다.
5. **YouTube 연동**: Google Cloud에서 YouTube Data API v3를 활성화하고 별도 발급한 키를 YouTube 전용 입력란에 저장합니다.
6. **기사 보완**: 완성 기사 아래에 빠진 정보나 수정 요청을 입력하고 **`AI로 전체 기사 보완`**을 누릅니다.

웹사이트 제한을 사용하는 YouTube 키에는 다음 주소를 허용해야 합니다.

```text
https://trafficcatcher.pages.dev/*
http://127.0.0.1/*
http://localhost/*
```

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
   브라우저에서 `http://127.0.0.1:5000`으로 접속합니다. 중복 서버는 포트·Windows 소켓 오류의 원인이 되므로 한 개만 실행합니다.

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

---

## 🧰 문제 해결

* **`WinError 10013`**: 중복 실행된 `portal_crawler.py --web` 서버를 종료하고 하나만 다시 실행합니다. 로컬 Python 소켓 오류가 완료 응답으로 확인되면 프로그램은 브라우저 Gemini 호출을 시도합니다.
* **YouTube가 로컬에서만 검색되지 않음**: YouTube 키의 웹사이트 제한에 `127.0.0.1`과 `localhost`를 추가합니다.
* **로컬과 Cloudflare 기사 결과가 다름**: 시스템 지침, 선택 모델, 각 도메인의 `localStorage` API 설정을 비교합니다. 생성형 AI 특성상 결과는 일부 달라질 수 있습니다.
* **키워드 기사 시스템 지침**: `skills/google-ai-studio-keyword-article.md`가 단일 원본이며 기사 작성 전에 캐시 없이 다시 로딩됩니다.
