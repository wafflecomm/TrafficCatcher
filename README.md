# 📈 Realtime Traffic Catcher
> **실시간 이슈·방송·문화·OTT·시즌 키워드·인기 주식 분석 및 AI 콘텐츠 제작 시스템**

포털 사이트와 **시그널(Signal.bz)**의 실시간 키워드 및 인기 주식, 이번 주 주요 방송사의 편성정보와 최근 시청률을 수집합니다. TourAPI 축제·행사, KOBIS 개봉 영화, KOPIS 공연과 시즌 캘린더를 결합해 콘텐츠 선점 후보를 제안하고, AI 콘텐츠 생성 API·Google News RSS·네이버 뉴스 Search API·YouTube Data API v3를 연동해 블로그 글과 삽화·쇼츠 4컷 스토리보드를 제작합니다.

- 운영 사이트: <https://trafficcatcher.pages.dev/>
- 로컬 주소: <http://127.0.0.1:5001>

---

## 🆕 최근 업데이트 (2026-08-26)

* **공개 네이버 검색어 트렌드**: 4대 포털 실시간 통합 핫이슈 상위 5개의 최근 7일 상대 검색지수는 로그인하지 않아도 조회할 수 있습니다. 방송·시즌·주식 영역의 확장 트렌드는 기존 회원 권한을 유지합니다.
* **네이버 트렌드 호출 최적화**: 메인·방송·시즌·주식의 각 트렌드 패널이 화면 가까이 들어오고 브라우저 탭이 활성 상태일 때만 API를 호출하며, 방문하지 않은 영역과 백그라운드 탭에서는 요청하지 않습니다. 영역별 15분·1시간·24시간 TTL 캐시도 함께 적용합니다.
* **포털 일치 뱃지 단순화**: 각 포털 키워드 옆 교차 일치 뱃지는 이모지와 사 글자를 제거하고 2, 3, 4처럼 숫자만 표시합니다. 통합 핫이슈 카드의 강조 아이콘은 유지합니다.
* **로그인 완료 전환 효과**: 이메일 OTP 인증에 성공하면 회원가입·로그인 창이 위쪽으로 슬라이드되며 1초 후 완전히 닫힙니다. 인증 실패 시에는 창을 유지합니다.
* **수집 버튼 시각 정리**: 실시간 수집 실행 버튼은 투명 배경과 얇은 회색 테두리를 사용하고, 마우스 오버 반응은 유지합니다.
* **명칭 및 접근성 정리**: 플로팅 진입 버튼과 문서 제목을 AI 콘텐츠 스튜디오로 통일하고 불필요한 이모지를 제거했습니다.

## 🎨 아키텍처 다이어그램 (Architecture)

본 시스템은 로컬 환경과 클라우드 환경(Cloudflare Pages)에서 모두 완벽하게 동작하는 하이브리드 아키텍처를 가집니다.

```mermaid
graph TD
    subgraph 1. Local Run Mode (Flask Server & Python Engine)
        A1[Developer Run] -->|python portal_crawler.py --web| B1[Flask Web Server]
        B1 -->|REST API| C1[BeautifulSoup & API Crawlers]
        C1 -->|Nate/Daum/Zum/Signal/Naver/Nielsen/TourAPI/KOBIS/KOPIS/Netflix| D1[Portal & Data Servers]
        C1 -->|Save & Update| E1[(trends.json, broadcast_top5.json, season_events.json, movie_releases.json, performances.json, netflix_top10.json, CSV logs)]
        B1 -->|ai_studio_code.py| F1[AI 콘텐츠 생성 API]
    end

    subgraph 2. Cloud Serverless Mode (Cloudflare Cron, GitHub Actions & Pages)
        A2[Cloudflare Cron Scheduler] -->|workflow_dispatch| B2[GitHub Actions Python Crawler]
        B2 -->|Fetch Data| C2[Portal & API Servers]
        B2 -->|Auto Commit & Push| D2[GitHub Repository]
        D2 -->|Webhook Trigger| E2[Cloudflare Pages Static Hosting]
        E2 -->|Live Portal Crawler & RSS| F2[User Web Browser]
        F2 -->|Client-Side REST API| G2[AI API + YouTube Data API v3]
    end

    subgraph 3. System Instructions Single Source of Truth
        S1[내부 AI 시스템 지침] -->|Dynamic Loader| F1
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
* **네이버 인기 검색 주식 (Top 25)**: 네이버 증권 검색상위에서 종목코드, 검색비율, 현재가, 등락률, 거래량을 함께 수집합니다. 네이버 수집 실패 시에만 Zum 종목을 보조 데이터로 사용합니다.
* Zum 키워드는 수집과 화면 렌더링 양쪽에서 최대 10위까지만 표시하며 원본의 상승·하락·동일 정보를 실제 순위와 분리해 보여줍니다.

### 2. 🔥 4대 포털 교차 유사도 분석 및 통합 핫이슈 (Cross Trending)
* 4대 포털 데이터를 형태소 토큰 단위로 실시간 분석하여 2개 이상 포털에서 동시 급상승 중인 키워드를 자동 탐지합니다.
* 포털 일치 개수는 각 포털 키워드 옆에 `2`, `3`, `4` 숫자 뱃지로 간결하게 표시하고, 마우스 호버 시 타 포털의 일치 키워드가 동시에 강조됩니다. 통합 핫이슈 카드의 강조 아이콘은 유지합니다.

### 3. 📺 이번 주 방송 편성표

* 월요일부터 일요일까지 날짜 탭을 제공하며 접속한 **오늘 날짜를 기본 선택**합니다.
* 네이버 편성정보에서 주요 방송사의 실제 방송시간과 프로그램명을 수집합니다.
* 닐슨코리아 공개 일일 순위의 최근 동일 요일 **전국 가구시청률**을 프로그램명과 채널 기준으로 결합합니다.
* 지상파 `KBS1·KBS2·MBC·SBS`, 종편 `JTBC·MBN·TV조선·채널A`, 케이블 `tvN·ENA·Mnet·OCN`을 지원합니다.
* 드라마·예능·영화와 스포츠·특별·특집·스페셜·특별편성을 중심으로 방송사별 최대 5개를 표시합니다.
* 정규 뉴스는 실시간 검색 키워드 영역과 중복되므로 제외합니다. 시청률을 매칭하지 못한 신규·특별 프로그램은 임의의 `0%` 대신 `집계 전`으로 표시합니다.
* 데이터 출처와 선별 키워드, 최종 갱신 시각을 방송 영역 상단에 표시합니다.
* 프로그램 행 전체를 클릭하거나 키보드 `Enter`·`Space`를 누르면 확인창을 표시하고, 승인 시 프로그램명으로 뉴스 팩트 검색과 글쓰기를 시작합니다.
* 결과는 `broadcast_top5.json`에 저장되며 로컬 Flask API와 Cloudflare Pages가 같은 파일을 사용합니다.

### 4. 💰 시즌 황금 키워드

* `실시간 인기 검색 주식` 위에서 `축제·행사`, `개봉 영화`, `공연`, `OTT 인기`, `시즌 키워드`, `명절·공휴일` 후보를 확인할 수 있습니다.
* 여름 전기요금·인버터 에어컨·에너지바우처, 명절 선물·교통, 연말정산 등 월별 반복 가능성이 높은 콘텐츠 시드를 제공합니다.
* 축제·행사는 TourAPI 전체 페이지와 검증된 공식기관 보완 데이터를 병합해 오늘부터 90일 이내 일정만 표시합니다. 제목·지역·장르 검색, 월별 필터와 20건씩 더 보기를 지원합니다.
* 개봉 영화는 영화진흥위원회 KOBIS, 공연은 공연예술통합전산망 KOPIS에서 오늘부터 90일 이내 일정을 수집합니다. 제목·지역·장르 검색, 월별 필터와 20건씩 더 보기를 함께 지원합니다.
* OTT 인기는 Netflix Tudum 공식 주간 TSV에서 한국 영화·시리즈와 글로벌 영어·비영어 영화·TV Top 10을 수집합니다. 별도 API 키는 필요하지 않으며 글로벌 목록에는 조회 수와 시청 시간을 표시합니다.
* **기초 기회지수(최대 65점)**는 시즌 시점, 키워드의 상업 의도, 현재 Signal·Daum·Nate·Zum 일치 신호를 합산하고 그래프·단계·툴팁으로 표시합니다. 축제·행사·개봉 영화·공연 목록은 기회지수 내림차순, 동점이면 오늘부터 30일 이내 시작 일정과 가까운 시작일 순으로 정렬합니다.
* `선점 준비`, `작성 추천`, `지금 발행`, `마감 임박`, `실시간 상승 확인` 상태를 표시합니다.
* 후보 카드 전체를 클릭하거나 키보드 `Enter`·`Space`를 누르면 확인창을 표시하고, 승인 시 선택한 축제·행사·개봉 영화·공연의 원본 이름이 `뉴스 검색 키워드`에 입력되어 Google News·YouTube 팩트 검색이 자동 시작됩니다.
* 현재 점수는 검색량이나 수익을 보장하지 않습니다. Google Trends·광고 지표는 아직 연결 대기 상태이며 화면에서도 사용 중인 데이터와 구분합니다.

### 5. AI 콘텐츠 스튜디오
* **역할 (Persona)**: 네이버/구글 SEO 상위 노출, 체류 시간 극대화 및 광고 수익(애드센스/애드포스트)을 최적화하는 수석 블로그 마케팅 전문가이자 인기 인플루언서.
* **키워드·뉴스 / 메모·스토리 작성 모드**: 실시간 검색 키워드 글과 사용자가 입력한 짧은 메모나 이야기를 분리해 작성합니다. 뉴스 검색 중 메모·스토리 탭으로 이동해도 요청을 유지하고 키워드 탭으로 돌아오면 진행 화면 또는 완료 결과를 복원합니다.
* **시스템 지침 분리 관리**: 키워드·뉴스와 메모·스토리는 작성 방식에 맞는 별도의 내부 시스템 지침을 사용합니다. 로컬 서버는 요청 시 최신 지침을 다시 읽고, 클라우드는 배포된 최신 지침을 불러옵니다.
* **충돌 방지형 AI 지침 계층**: AI API에는 `절대 규칙 → 서비스 공통 규칙 → 사용자 개인 시스템 지침 → 페르소나·톤앤매너 → 현재 입력 자료` 순서로 구조화해 전달합니다. 하위 지침이 상위 지침과 충돌하면 상위 규칙을 따르도록 각 영역의 제목과 충돌 해결 원칙을 함께 전달합니다.
* **AI 글쓰기 개인화**: 작성 카테고리, 페르소나, 말투 강도, 글의 밀도와 사용자 추가 요청을 계정별로 저장합니다. AI 시스템 지침 관리에서는 키워드·뉴스와 메모·스토리용 개인 지침을 각각 DB에 저장합니다.
* **일관된 글쓰기 UI**: 기능명은 `글쓰기`로 표준화하고 실제 버튼은 아이콘·문구를 가로·세로 중앙 정렬합니다. `뉴스 검색 키워드`, `글 주제 또는 제목`, 시즌 문화 일정 검색창은 동일한 회색 입력 배경을 사용하며 글 미리보기는 전체 외곽선을 표시합니다. 저장 원고 목록은 PC 최대 `1440px`, 모바일 전체 폭으로 제공합니다.
* **명확한 수집 상태 표시**: 상단에 `✅ 동작 완료`와 `⏰ 다음 실시간 수집`을 두 줄로 구분하고, 데이터가 없거나 로딩 중일 때는 각각 `⚠️`, `⏳` 상태를 표시합니다.
* **키워드 속성 3대 자동 판별 (`detect_keyword_type`)**:
  * **① 이슈/트렌드형 (`TREND`)**: 실시간 속보, 연예, 사회적 이슈 맞춤 오프닝 및 파급 효과 분석.
  * **② 정보/스테디형 (`INFO`)**: 방법, 신청, 일정, 세금, 지원금 등 맞춤 체크리스트 및 실전 꿀팁.
  * **③ 리뷰/상업형 (`REVIEW`)**: 후기, 가격, 스펙, 비교, 장단점 등 솔직 담백한 구매 가이드.
* **1+ 적응형 팩트 합성 (1+ Adaptive Synthesis)**:
  * 실시간 구글 뉴스 및 유튜브 영상에서 수집된 팩트 출처가 **1개만 있어도, 2개 또는 3개가 있어도** 1,500자~2,000자 이상의 꽉 찬 고품질 원고로 자동 재구성.

#### AI 시스템 지침 우선순위와 관리 위치

| 우선순위 | 지침 영역 | 관리 위치 | 변경 권한 |
|---:|---|---|---|
| 1 | 절대 규칙 | 내부 운영 지침 | 운영자 소스 관리 |
| 2 | 서비스 공통 규칙 | 작성 모드별 내부 지침 | 운영자 소스 관리 |
| 3 | 사용자 개인 시스템 지침 | 콘텐츠 스튜디오의 `AI 시스템 지침 관리` | 로그인 사용자 |
| 4 | 페르소나·톤앤매너 | 콘텐츠 스튜디오의 `AI 페르소나·톤앤매너 설정`에서 대분류·세부 주제·작성자 유형·말투를 선택 | 로그인 사용자 |
| 5 | 현재 입력 | 선택 글·수집 본문 또는 메모·스토리·추가 요청 | 현재 작성 요청 |

절대 규칙에는 제공 자료 밖의 사실·수치·인용·경험·출처 생성 금지, 출처 임의 변경 금지, 사실과 의견 구분, 원문 의미 왜곡 금지, 개인정보·명예훼손·불법 조장 방지 규칙이 포함됩니다. 일반 회원 UI에서는 수정할 수 없으며 운영자가 Markdown 파일을 검토해 변경합니다.

로컬 Python 생성기는 파일을 직접 읽고, 브라우저는 로컬에서 읽기 전용 `GET /api/absolute_rules`를 우선 사용합니다. Cloudflare 정적 환경은 배포된 동일 Markdown 파일을 읽습니다. 개인 시스템 지침은 최대 20,000자, 페르소나 지침은 최대 4,000자까지 결합하며, 파일을 불러오지 못하면 최소 팩트 생성 금지 규칙을 안전 기본값으로 적용합니다.
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
  * 쇼츠 4컷 프롬프트 전체를 Markdown 문서 형식으로 한 번에 복사할 수 있습니다.

### 6. 🌐 전천후 클라이언트 사이드 실시간 라이브 크롤링 & 안전 로딩
* **관리자 뉴스 검색 방식**: 관리자 페이지에서 `네이버 뉴스`, `Google News`, `네이버 뉴스 → Google News`, `Google News → 네이버 뉴스` 중 하나를 선택합니다. 단일 방식은 선택한 서비스만 호출하고, 순서 방식은 첫 검색 결과가 3건보다 부족하거나 실패할 때 다음 서비스로 보완합니다. Google News RSS의 링크는 서비스 특성상 Google News를 거쳐 원문으로 이동하므로 원문 직링크가 중요하면 네이버 뉴스 우선 방식을 권장합니다. Google News 직접 요청 실패 시에는 설정된 한국 프록시로 한 번 재시도하며, 최종 결과는 제목·URL 중복을 제거합니다.
* **클라우드 정적 호스팅(Cloudflare Pages) 환경 지원**:
  * `[⚡ 실시간 수집 실행]` 버튼 클릭 시 브라우저가 직접 시그널 API, 구글 트렌드 RSS, 포털 실시간 데이터를 1~2초 만에 라이브로 수집하여 즉시 화면을 갱신합니다.
* **다단계 안전 로딩 파이프라인**:
  * `trends.json` ➔ `로컬 Flask API` ➔ `브라우저 실시간 수집` ➔ `CSV 파싱` 순으로 시도합니다.
  * 모든 수집이 실패하면 임의 기본값을 표시하지 않고 수집 실패 상태를 명확히 안내합니다.

### 7. 🔑 AI·YouTube API Key 분리 관리

* AI 글쓰기 키는 Cloudflare의 암호화 Secret `GEMINI_API_KEY`에서만 관리하며 브라우저에 입력·저장하거나 외부 AI 서비스로 직접 노출하지 않습니다.
* 로그인한 회원의 글쓰기 요청만 Cloudflare Worker의 `/api/gemini/interactions` 프록시를 거쳐 처리됩니다.
* 로컬 서버 역시 `.env` 또는 서버 환경변수 `GEMINI_API_KEY`만 사용하고 요청 본문의 키는 받지 않습니다.
* YouTube Data API v3 영상 검색 키는 현재 별도 브라우저 설정을 사용합니다.
* Google 뉴스는 최대 3개, YouTube 공식 검색 결과는 네 번째 줄에 `🎥` 아이콘으로 표시합니다.
* 영상 검색 실패 시 API 활성화, 키 제한, 할당량 등 진단 원인을 표시합니다.

### 8. ✨ AI 기반 전체 글 보완

* `AI로 글 보완하기`는 입력 문장을 하단에 붙이지 않고 현재 글 전체와 보완 요청을 AI가 다시 분석합니다.
* 빠진 정보, 수정할 사실, 강화할 관점을 기존 문맥에 자연스럽게 통합합니다.
* Google·YouTube 검색은 다시 실행하지 않으며 기존 Fact Sources를 유지합니다.
* 실패 시 원문을 보존하고 성공 후 `수정 전으로` 버튼으로 되돌릴 수 있습니다.

### 9. 📝 네이버 블로그 글쓰기 연결

* `네이버 글쓰기 열기`는 현재 글을 HTML 리치 텍스트로 복사하고 네이버 블로그 글쓰기 화면을 엽니다.
* 관리자 계정은 `내 프로필 → 네이버 글쓰기 기능`에서 해당 버튼을 계정별로 켜거나 끌 수 있습니다.
* `내 원고함`은 로그인 계정별로 최근 수정순 최대 5개를 저장합니다. 로컬 개발 환경은 회원 SQLite DB, Cloudflare 운영 환경은 D1 `AUTH_DB`를 사용합니다. 동일 제목은 갱신하고 6번째 저장 시 확인 후 가장 오래된 원고를 교체합니다.
* 네이버 스마트에디터에서 `Ctrl+V`로 붙여넣은 뒤 최종 발행은 사용자가 직접 확인합니다.

### 10. 👤 이메일 OTP 회원가입·로그인

이메일과 닉네임만 입력하고 6자리 OTP를 인증하면 최초 회원가입과 이후 로그인이 같은 흐름으로 처리됩니다.

* 로컬: Flask + SQLite 회원 DB, SMTP 발송 또는 서버 실행 창 개발 OTP
* 클라우드: Cloudflare Worker + D1 회원 DB + Resend 이메일 발송
* 보안: OTP 5분 만료, 60초 재발송 제한, 5회 입력 제한, OTP·세션 토큰 해시 저장, HttpOnly 로그인 쿠키
* 설정 안내: [MEMBER_AUTH_SETUP.md](./MEMBER_AUTH_SETUP.md)
* 관리자 시스템 지침 인증은 기존 비밀번호 방식을 유지하며 회원 권한 체계와의 통합은 다음 단계에서 진행합니다.

---
## 🛠️ 기술 스택 (Technology Stack)

* **Language**: Python 3.x, JavaScript (ES6+ / Node.js VM 검증 완료)
* **AI & LLM Engine**:
  * 프로덕션 권장 AI 고속·고품질 모델
  * `google-genai` 최신 공식 SDK 및 REST API v1beta 동시 지원
  * YouTube Data API v3 `search.list`
  * Google Imagen 3 프롬프트 연동
* **Libraries & Frameworks**:
  * `requests`, `BeautifulSoup4`, `pandas`, `flask`, `lxml`
* **Hosting & CI/CD**:
  * Cloudflare Pages (정적 호스팅 및 배포)
  * Cloudflare Cron Trigger (실시간 KST 06:00~23:30 매 30분, 시즌·문화 KST 06:30부터 22:30까지 4시간 간격)
  * GitHub Actions `workflow_dispatch` (Cloudflare 예약 호출과 GitHub UI 수동 호출을 받아 Python 수집 실행)
* **Design**:
  * Vanilla CSS3 (HSL 디자인 시스템, 글래스모피즘, 9:16 스토리보드 뷰어, 반응형 레이아웃)

---

## 🚀 사용 설명서 (Usage Guide)

### 🔐 API 설정 가이드

API 키는 용도에 따라 저장 위치가 다릅니다. 서버 수집용 키를 브라우저에 넣거나, 브라우저 전용 키를 GitHub 소스에 직접 기록하지 마세요.

| 서비스 | 설정 이름 | 저장 위치 | 사용 목적 |
| :--- | :--- | :--- | :--- |
| 한국관광공사 TourAPI | `TOUR_API_SERVICE_KEY` | 로컬 `.env`, GitHub Actions Repository Secret | 축제·행사 서버 수집 |
| 영화진흥위원회 KOBIS | `KOBIS_API_KEY` | 로컬 `.env`, GitHub Actions Repository Secret | 개봉 영화 서버 수집 |
| 공연예술통합전산망 KOPIS | `KOPIS_API_KEY` | 로컬 `.env`, GitHub Actions Repository Secret | 공연 서버 수집 |
| AI 콘텐츠 생성 API | `GEMINI_API_KEY` | Cloudflare Secret, 로컬 `.env` | 로그인 회원의 블로그 글·삽화·쇼츠 생성 및 글 보완 |
| NAVER API HUB 뉴스 검색 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | Cloudflare Secret, 로컬 `.env` | 키워드별 최신 뉴스 JSON 검색 |
| NAVER API HUB 검색어 트렌드 | 뉴스 검색과 동일 | Cloudflare Secret, 로컬 `.env` | 4대 포털 통합 핫이슈 상위 5개의 최근 7일 상대 검색지수 비교 |
| YouTube Data API v3 | `youtube_api_key` | 웹 설정 화면의 브라우저 `localStorage` | 유튜브 검색 및 팩트 출처 수집 |
| AI 독립 스크립트 | `GEMINI_API_KEY` | 실행 환경 변수 | `ai_studio_code.py` 실행 |
| YouTube 로컬 서버 대체 키 | `YOUTUBE_API_KEY` | 실행 환경 변수(선택) | 브라우저 키가 전달되지 않을 때 로컬 검색 |

#### 1. TourAPI 키 발급

1. 공공데이터포털에서 **한국관광공사_국문 관광정보 서비스_GW(TourAPI)** 활용 신청을 완료합니다.
2. 서비스 End Point가 `https://apis.data.go.kr/B551011/KorService2`인지 확인합니다.
3. 발급 화면의 **일반 인증키**를 복사합니다. URL 인코딩 키와 디코딩 키를 모두 처리하도록 구현되어 있습니다.
4. 인증키 실제 값은 README, Python, HTML, JSON 또는 Git 커밋에 기록하지 않습니다.

#### 2. 로컬 TourAPI 설정

프로젝트 루트의 `.env` 파일에 다음 한 줄을 작성합니다. `.env`는 `.gitignore`에 등록되어 GitHub에 올라가지 않습니다.

```dotenv
TOUR_API_SERVICE_KEY=발급받은_일반_인증키
KOBIS_API_KEY=발급받은_KOBIS_키
KOPIS_API_KEY=발급받은_KOPIS_키
```

설정 후 실행 중인 서버를 완전히 종료하고 `실행_웹서버.bat`을 다시 실행합니다. 정상 연결 여부는 다음 주소에서 확인할 수 있습니다.

```text
http://127.0.0.1:5001/api/season-events
```

정상 응답 기준은 `status`가 `success`이고 `items`가 빈 배열이 아닌 상태입니다. 수집기는 오늘부터 90일 이내 행사를 TourAPI 전체 페이지에서 가져오고, 성공 데이터는 24시간 동안 재사용합니다.

개봉 영화와 공연 연결 상태는 다음 주소에서 각각 확인합니다.

```text
http://127.0.0.1:5001/api/movie-releases
http://127.0.0.1:5001/api/performances
```

#### 3. KOBIS·KOPIS API 키 발급

**KOBIS(개봉 영화)**

1. 영화진흥위원회 KOBIS Open API 사이트에서 회원가입·로그인합니다: <https://www.kobis.or.kr/kobisopenapi/>
2. `키 발급/관리`에서 Open API 키를 신청합니다.
3. 발급된 키를 `.env`의 `KOBIS_API_KEY`와 GitHub Repository Secret의 같은 이름으로 등록합니다.

**KOPIS(공연)**

1. 공연예술통합전산망 Open API 안내 페이지로 이동합니다: <https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do>
2. PC에서 `인증키 발급신청`을 선택하고 신청 정보를 입력합니다.
3. 이메일로 받은 인증키를 `.env`의 `KOPIS_API_KEY`와 GitHub Repository Secret의 같은 이름으로 등록합니다.
4. 화면과 서비스에는 `공연예술통합전산망 KOPIS` 출처 표기를 유지해야 합니다.

#### 4. GitHub Actions 서버 수집 API Secret 설정

GitHub 저장소에서 다음 순서로 이동합니다.

```text
Settings
→ Secrets and variables
→ Actions
→ Secrets
→ New repository secret
```

아래 세 이름을 각각 정확히 등록합니다.

```text
Name: TOUR_API_SERVICE_KEY
Secret: 발급받은 일반 인증키 전체

Name: KOBIS_API_KEY
Secret: 발급받은 KOBIS API 키

Name: KOPIS_API_KEY
Secret: 발급받은 KOPIS API 키
```

`Variables`가 아니라 반드시 `Secrets` 탭에 등록해야 합니다. 현재 워크플로 `.github/workflows/crawl_and_deploy.yml`은 이 값을 수집 프로세스의 환경 변수로 전달합니다.

```yaml
env:
  TOUR_API_SERVICE_KEY: ${{ secrets.TOUR_API_SERVICE_KEY }}
```

등록 직후 확인하려면 저장소의 `Actions`에서 **Crawl Portal Trends and Deploy**를 선택하고 `Run workflow`를 실행합니다. 로그에 다음 형식의 성공 메시지가 표시되어야 합니다.

```text
[성공] 축제·행사 N건을 season_events.json에 저장했습니다.
```

예약 시각은 별도 `trafficcatcher-scheduler` Cloudflare Worker가 관리합니다. 실시간 수집은 KST 06:00~23:30에 30분 간격으로, 축제·행사·개봉 영화·공연·OTT 수집은 매일 KST 06:30부터 22:30까지 4시간 간격으로 실행되며 Worker가 해당 GitHub Actions 워크플로의 `workflow_dispatch`를 호출합니다. GitHub의 `Run workflow` 수동 실행도 계속 사용할 수 있습니다. 설정과 안전한 전환 순서는 [Cloudflare Cron Scheduler 운영 가이드](docs/CLOUDFLARE_CRON_SCHEDULER_GUIDE.md)를 참고합니다.

#### 5. Cloudflare Pages 설정

TourAPI·KOBIS·KOPIS 같은 수집 API 키는 Cloudflare에 등록하지 않습니다. 다만 서버 측 AI 프록시에 사용하는 `GEMINI_API_KEY`는 Cloudflare Pages의 암호화 Secret으로 등록해야 합니다.

```text
외부 데이터/API → GitHub Actions → JSON·CSV → GitHub main → Cloudflare Pages
```

Cloudflare Pages에서는 Git 연동 저장소와 Production branch가 `main`인지, 자동 배포가 활성화되어 있는지만 확인합니다. 배포 확인 주소는 다음과 같습니다.

```text
https://trafficcatcher.pages.dev/season_events.json
```

Cloudflare 환경 변수에 TourAPI 키를 중복 등록하면 키 관리 지점만 늘어나므로 권장하지 않습니다.

#### 6. AI API 설정

1. Cloudflare Dashboard에서 `Workers & Pages` → `trafficcatcher` 프로젝트를 선택합니다.
2. `Settings` → `Variables and Secrets` → `Add`를 선택합니다.
3. 이름을 `GEMINI_API_KEY`, 값을 AI 서비스에서 발급받은 키로 입력하고 반드시 `Secret` 유형으로 저장합니다.
4. Production 환경에 적용한 뒤 새 배포를 실행합니다.
5. 로그인 후 콘텐츠 스튜디오의 API 상태가 `API 연동`으로 표시되는지 확인합니다. 키 값은 브라우저로 반환되지 않습니다.

관리자 페이지에서는 `Cloudflare 직접 연결`과 `한국 서버 경유` 중 하나를 선택할 수 있습니다. 한국 서버 경유 모드는 Oracle 인증 프록시 URL과 32자 이상의 인증키가 준비된 경우에만 활성화됩니다. 운영 환경은 HTTPS를 사용해야 하며, 자세한 구성은 [AI API 한국 서버 경유 설정 가이드](docs/AI_API_KOREA_RELAY_GUIDE.md) 또는 [HTML 가이드](docs/AI_API_KOREA_RELAY_GUIDE.html)를 참고합니다.

같은 관리자 페이지의 `뉴스 검색 방식` 설정은 `service_settings.news_search_mode`에 저장되며 로컬 Flask와 Cloudflare Worker의 다음 뉴스 팩트 검색부터 공통 적용됩니다. 기본값은 `Google News → 네이버 뉴스`입니다.

로컬에서는 콘텐츠 스튜디오의 `API 연동 설정`에서 AI·YouTube 키와 NAVER API HUB Client ID·Client Secret을 등록·검증·삭제할 수 있습니다. 브라우저에는 인증값을 저장하지 않으며 로컬 Flask 서버가 Git 제외 파일 `.env`의 `GEMINI_API_KEY`, `YOUTUBE_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 원자적으로 갱신합니다. 직접 `.env`에 등록한 경우에는 웹 서버를 재시작합니다.

Cloudflare 운영 환경에서는 Workers & Pages 프로젝트의 Settings → Variables and Secrets에 NAVER API HUB에서 발급한 Client ID와 Client Secret을 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`이라는 이름의 **Secret**으로 각각 등록해야 합니다. 2026년 7월 31일부터 검색 API 신규 신청은 네이버 개발자센터가 아닌 NAVER API HUB에서만 가능하며, 뉴스 검색 호출 한도는 Client ID 기준 하루 25,000회입니다.

독립 Python 스크립트를 사용할 때는 브라우저 저장값을 읽을 수 없으므로 실행 환경에 별도로 설정합니다.

```powershell
$env:GEMINI_API_KEY="발급받은_AI_API_키"
python ai_studio_code.py
```

#### 7. YouTube Data API v3 설정

1. Google Cloud Console에서 YouTube Data API v3를 활성화합니다.
2. API 키의 웹사이트 제한에 사용하는 주소를 등록합니다.

```text
https://trafficcatcher.pages.dev/*
http://127.0.0.1/*
http://localhost/*
```

3. 콘텐츠 스튜디오 API 설정에서 YouTube 키를 입력하고 연결을 확인합니다.
4. `API가 활성화되지 않음`, `허용되지 않은 referrer`, `quotaExceeded` 오류는 각각 API 활성화, 웹사이트 제한, 일일 할당량을 확인합니다.

#### 7. API 키 보안 원칙

* `.env`와 실제 인증키를 Git에 추가하지 않습니다.
* 인증키를 README, 화면 캡처, Actions 로그, 오류 메시지에 그대로 남기지 않습니다.
* 키가 공개 저장소나 대화·로그에 노출됐다면 기존 키를 폐기하고 새 키를 발급합니다.
* GitHub Secret은 저장 후 실제 값을 다시 보여주지 않습니다. 수정이 필요하면 같은 이름의 Secret 값을 갱신합니다.
* AI·YouTube 키는 브라우저별로 저장되며 서버 수집용 TourAPI 키와 공유하지 않습니다.

### 네이버 블로그 글쓰기

별도 도우미 프로그램 없이 `네이버 글쓰기 열기`를 누르면 현재 글의 서식을 복사하고 네이버 글쓰기 화면을 엽니다. 네이버 계정 정보와 쿠키는 Traffic Catcher로 전송하지 않으며, 붙여넣기와 최종 발행은 사용자가 직접 확인합니다.

### 모드 A: 🌐 온라인 웹 대시보드 사용하기 (Cloudflare Pages)
* **접속 주소**: [https://trafficcatcher.pages.dev](https://trafficcatcher.pages.dev)
1. **실시간 트렌드 확인**: 4대 포털 실시간 키워드를 확인합니다.
2. **실시간 수집 실행**: 상단 헤더의 **`[⚡ 실시간 수집 실행]`** 버튼을 누르면 브라우저가 즉시 최신 4대 포털 데이터를 라이브로 수집하여 화면을 갱신합니다.
3. **방송 편성표 확인**: 오늘 날짜 또는 월~일 탭을 선택하고 지상파·케이블·종편별 전체 방송시간과 최근 시청률을 확인합니다.
4. **시즌 후보 확인**: 시즌 황금 키워드에서 이번 달·다음 달·명절 후보와 오늘부터 90일 이내 축제·행사를 확인합니다.
5. **인기 주식 확인**: 네이버 증권 인기 검색 주식 25개 종목과 데이터 기준 시각을 확인합니다. 종목 행을 선택하면 확인 후 종목명으로 글쓰기를 시작합니다.
6. **AI 글쓰기**: Cross Trending의 글쓰기 버튼을 사용하거나 포털 키워드·방송 프로그램·시즌 황금 키워드·인기 주식의 데이터 행을 선택하고 확인창에서 승인합니다.
7. **AI·YouTube 연동**: 각 서비스에서 발급한 키를 분리된 전용 입력란에 저장합니다.
8. **글 보완**: 완성 글 아래에 빠진 정보나 수정 요청을 입력하고 **`AI 전체 글 보완하기`**를 누릅니다.

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
   실행_웹서버.bat
   ```
   브라우저에서 `http://127.0.0.1:5001`로 접속합니다. 중복 서버는 포트·Windows 소켓 오류의 원인이 되므로 웹 서버는 한 개만 실행합니다.

3. **AI 콘텐츠 생성 독립 스크립트 실행**
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

## 🌐 외부 데이터 연동 총람

| 구분 | 수집처·경로 | 인증 | 갱신 기준 | 저장·사용 위치 |
| :--- | :--- | :--- | :--- | :--- |
| 실시간 검색어 | Signal `api.signal.bz/news/realtime` | 없음 | 로컬 15분, Cloudflare Cron KST 06:00~23:30 매 30분 | `signal_realtime_keywords.csv`, `trends.json` |
| 다음 트렌드 | Daum 모바일 페이지 `m.daum.net` | 없음 | 동일 | `realtime_trends.csv`, `trends.json` |
| 네이트 이슈 | Nate 메인·실시간 키워드 데이터 | 없음 | 동일 | `realtime_trends.csv`, `trends.json` |
| 줌 검색어 | Zum 메인 직렬화 데이터 | 없음 | 동일 | `realtime_trends.csv`, `trends.json` |
| 인기 검색 주식 | 네이버 증권 검색상위, Zum 증권(장애 시 보조) | 없음 | 동일 | `realtime_trends.csv`, `trends.json` |
| 방송 편성 | 네이버 편성정보 | 없음 | 최근 성공본 1시간 재사용 | `broadcast_top5.json` |
| 방송 시청률 | Nielsen Korea 공개 일일 순위 | 없음 | 최근 성공본 1시간 재사용 | `broadcast_top5.json` |
| 축제·행사 | 한국관광공사 TourAPI `KorService2/searchFestival2` | `TOUR_API_SERVICE_KEY` | KST 06:30~22:30 4시간 간격, 오늘부터 90일·성공본 24시간 재사용 | `season_events.json` |
| 공식행사 보완 | `official_event_supplements.json`, FUN SEOUL 등 검증된 공식기관 정보 | 없음 | 저장된 공식 일정 병합 | `season_events.json` |
| 개봉 영화 | 영화진흥위원회 KOBIS 영화목록 API | `KOBIS_API_KEY` | KST 06:30~22:30 4시간 간격, 오늘부터 90일·성공본 24시간 재사용 | `movie_releases.json` |
| 공연 | 공연예술통합전산망 KOPIS 공연목록 API | `KOPIS_API_KEY` | KST 06:30~22:30 4시간 간격, 진행 중·90일 이내·성공본 24시간 재사용 | `performances.json` |
| OTT 인기 | Netflix Tudum 공식 `all-weeks-countries.tsv`, `all-weeks-global.tsv` | 없음 | KST 06:30~22:30 4시간 간격 확인, 공식 주간 발표 기준·성공본 24시간 재사용 | `netflix_top10.json` |
| OTT 한글 제목 | 영어 원제 자동번역 후 기존 번역 캐시 재사용 | 없음 | 신규 제목 발생 시 | `netflix_top10.json`의 `title_ko` |
| 기사 팩트 | NAVER API HUB `/search/v1/news` | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 콘텐츠 스튜디오에서 요청 시 | 브라우저·로컬 API 응답 |
| 영상 팩트 | YouTube Data API v3 `search.list` | `youtube_api_key` 또는 `YOUTUBE_API_KEY` | 콘텐츠 스튜디오에서 요청 시 | 브라우저·로컬 API 응답 |
| 글·쇼츠 생성 | AI API | Cloudflare Secret 또는 로컬 환경변수 `GEMINI_API_KEY` | 사용자가 작성 요청 시 | 브라우저 화면·저장 원고 |

포털 HTML·내부 직렬화 데이터는 공개 API가 아니므로 사이트 구조 변경 시 수집기가 영향을 받을 수 있습니다. 공식 API와 TSV도 제공기관 정책·필드 변경 가능성이 있어, 수집 실패 시 임의 기본값을 만들지 않고 기존 정상 수집본을 유지하거나 명확한 오류 상태를 저장합니다. API 키와 브라우저 키는 `.env`, GitHub Repository Secret 또는 브라우저 `localStorage`에만 보관하며 Git 추적 파일에는 기록하지 않습니다.

### 자동수집·배포 흐름

1. 로컬 서버는 실시간 검색어·인기 주식을 15분마다 확인하고, 방송 편성·시청률은 최근 성공본을 1시간, 시즌·문화·OTT는 24시간 재사용합니다.
2. Cloudflare Cron Scheduler는 정해진 KST 시각에 GitHub Actions의 `workflow_dispatch`를 호출합니다.
3. GitHub Actions는 Python 수집기를 실행하고 변경된 JSON·CSV를 GitHub에 커밋합니다.
4. Cloudflare Pages는 연결된 `main` 브랜치의 변경을 자동 배포합니다. Scheduler Worker에는 GitHub Actions 실행 전용 최소 권한 토큰만 Secret으로 저장합니다.

### 데이터 무결성 및 자동 복구

* 웹 서버는 포트가 달라도 프로젝트당 한 프로세스만 실행됩니다. 두 번째 서버는 수집 스케줄러를 시작하기 전에 종료되어 구버전 프로세스가 최신 JSON을 덮어쓰는 문제를 방지합니다.
* 영화·공연·OTT JSON에는 `schema_version`을 기록합니다. 현재 코드와 버전이 다르면 최근 24시간 이내 캐시라도 다시 수집합니다.
* 개봉 영화는 `genre`와 `nation`, OTT는 `title_ko` 필드를 검사합니다. 필수 정보가 일정 비율 이상 누락되면 캐시를 정상으로 간주하지 않고 자동 복구합니다.
* JSON은 같은 폴더의 고유 임시 파일에 완전히 기록하고 디스크 동기화한 뒤 원본과 원자적으로 교체합니다. 저장 중단이나 동시 쓰기로 인한 불완전한 파일 노출을 방지합니다.
* 수집 실패 시 임의 기본값을 만들지 않으며, 검증된 기존 성공본만 유지합니다.

---

## 📊 데이터 저장 스키마 명세

### 1. 통합 수집 로그 (`realtime_trends.csv`)

| 컬럼명 | 데이터 형태 | 예시 값 | 설명 |
| :--- | :--- | :--- | :--- |
| **Timestamp** | String (DateTime) | `2026-08-16 01:00:00` | 데이터를 크롤링하여 저장한 시각 |
| **Site** | String | `Nate` / `Daum` / `Zum_Keyword` / `Naver_Stock` / `Signal` | 데이터 수집 대상 사이트명 구분. 주식은 네이버가 기본이며 장애 시 `Zum_Stock`을 사용합니다. |
| **Rank** | Integer | `1` ~ `25` | 각 포털 사이트 내 트렌드/주식 순위 |
| **Keyword** | String | `기아` / `LG 존 케네디 영입` | 검색어 키워드 또는 수집된 주식 종목명 |
| **Detail** | String | `상승` / `코드: 005930 \| 검색비율: 21.35% \| 현재가: 281,500원 \| 변동률: +3.87% \| 거래량: 27,672,192주` | 변동 정보 또는 주식 시세 상세 텍스트 |

### 2. 시그널 전용 로그 (`signal_realtime_keywords.csv`)

| 컬럼명 | 데이터 형태 | 예시 값 | 설명 |
| :--- | :--- | :--- | :--- |
| **Timestamp** | String (DateTime) | `2026-08-16 01:00:00` | 데이터를 크롤링하여 저장한 시각 |
| **Rank** | Integer | `1` ~ `10` | 시그널 실시간 인기 검색어 순위 |
| **Keyword** | String | `LG 존 케네디 영입` | 실시간 인기 검색어명 |

### 3. 주간 방송 편성·시청률 (`broadcast_top5.json`)

| 필드 | 설명 |
| :--- | :--- |
| `updated_at` | 한국 표준시 기준 최종 수집 시각 |
| `source` | 네이버 편성정보·닐슨코리아 등 실제 수집 출처 |
| `days` | 이번 주 월~일 날짜별 데이터 |
| `channels` | 방송사명과 지상파·케이블·종편 분류 |
| `programs` | 방송시간, 프로그램명, 최근 시청률, 시청률 기준일 |

### 4. 시즌 축제·행사 (`season_events.json`)

한국관광공사 TourAPI의 `searchFestival2` 전체 페이지에서 오늘부터 90일 이내 전국 축제·행사를 수집합니다. 화면에서는 행사명·지역 검색, 월별 필터와 20건씩 더 보기를 제공합니다. 로컬 실행 전 환경 변수 `TOUR_API_SERVICE_KEY`를 설정하고, GitHub Actions에서는 같은 이름의 Repository secret을 등록합니다. 키가 없거나 수집에 실패하면 임의 기본 행사를 표시하지 않으며, 성공한 기존 수집본이 있으면 그대로 유지합니다.

| 필드 | 설명 |
| :--- | :--- |
| `status` | `success`, `key_required`, `error` 중 현재 연결 상태 |
| `source` | 한국관광공사 TourAPI 공식 수집 출처 |
| `basis` | 수집 기간 기준 |
| `items` | 행사명, 시작·종료일, 지역, 이미지 정보 |

### 5. 개봉 영화 (`movie_releases.json`)

| 필드 | 설명 |
| :--- | :--- |
| `status`, `updated_at`, `basis` | 연결 상태, 최종 수집 시각, 오늘부터 90일 범위 |
| `items[].title` | 영화명 |
| `items[].start_date` | 개봉일 `YYYYMMDD` |
| `items[].genre`, `nation`, `director` | 장르, 제작국가, 감독 |

### 6. 공연 (`performances.json`)

| 필드 | 설명 |
| :--- | :--- |
| `status`, `updated_at`, `basis` | 연결 상태, 최종 수집 시각, 수집 범위 |
| `items[].title` | 공연명 |
| `items[].start_date`, `end_date` | 공연 시작·종료일 |
| `items[].genre`, `region`, `venue` | KOPIS 장르, 지역, 공연장 |
| `items[].image`, `url` | 포스터와 KOPIS 상세 링크 |

### 7. Netflix OTT 인기 (`netflix_top10.json`)

| 필드 | 설명 |
| :--- | :--- |
| `country_week`, `global_week` | 한국·글로벌 최신 공식 집계 주차 |
| `lists.korea_films`, `korea_tv` | 대한민국 영화·시리즈 Top 10 |
| `lists.global_*` | 글로벌 영어·비영어 영화·TV Top 10 |
| `rank`, `weeks_in_top10` | 주간 순위와 누적 Top 10 진입 주수 |
| `weekly_views`, `weekly_hours_viewed`, `runtime` | 글로벌 목록의 조회 수, 시청시간, 러닝타임 |
| `title_ko`, `title` | 캐시된 한글 자동번역 제목과 Netflix 영어 원제 |

---

## 📄 라이선스 (License)
© 2026 Traffic Catcher. All rights reserved.

---

## 🧰 문제 해결

* **`WinError 10013`**: 중복 실행된 `portal_crawler.py --web` 서버를 종료하고 하나만 다시 실행합니다. 로컬 AI 호출은 브라우저 키가 아니라 서버의 `GEMINI_API_KEY`를 사용합니다.
* **YouTube가 로컬에서만 검색되지 않음**: YouTube 키의 웹사이트 제한에 `127.0.0.1`과 `localhost`를 추가합니다.
* **로컬과 Cloudflare 글 결과가 다름**: 시스템 지침과 선택 모델을 비교하고 양쪽 서버의 `GEMINI_API_KEY` 설정 상태를 확인합니다. 생성형 AI 특성상 결과는 일부 달라질 수 있습니다.
* **키워드·뉴스 시스템 지침**: 내부 운영 지침이 단일 원본이며 글쓰기 전에 캐시 없이 다시 로딩됩니다.
* **절대 규칙이 반영되지 않음**: 로컬 서버를 재시작하고 운영 지침 API가 정상 응답하는지 확인합니다. Cloudflare에서는 최신 운영 지침이 배포됐는지 확인합니다.
