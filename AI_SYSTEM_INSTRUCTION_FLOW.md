# AI System Instruction 전달 구조

> 기준: Traffic Catcher 로컬 개발 서버 · 2026-08-26

## 1. 개요

로컬 AI 글쓰기는 사용자가 선택한 글쓰기 유형에 따라 `keyword`와 `story` 중 하나를 결정하고, 로그인 계정에 저장된 해당 유형의 개인 시스템 지침만 불러와 AI API에 전달합니다.

| 화면 선택 | 내부 모드 | 조회하는 개인 지침 |
|---|---|---|
| 키워드·뉴스 | `keyword` | `instruction_type=keyword` |
| 스토리·원고 | `story` | `instruction_type=story` |

선택하지 않은 반대 유형의 개인 지침은 조회하거나 합치지 않습니다.

## 2. 전체 전달 흐름

```text
글쓰기 유형 선택
  → activeWritingMode 확정
  → 로그인 계정 DB에서 선택 유형의 개인 지침 재조회
  → 브라우저가 /api/generate_content로 작성 데이터 전달
  → Flask가 요청값 검증
  → ai_studio_code.py가 공통 규칙과 선택 지침 조립
  → AI 콘텐츠 생성 요청(system_instruction, input) 호출
```

## 3. 글쓰기 유형 결정

상단의 `키워드·뉴스`, `스토리·원고` 선택값은 `activeWritingMode`에 저장됩니다.

```javascript
activeWritingMode = mode === 'story' ? 'story' : 'keyword';
```

AI 글쓰기 버튼을 누르면 다음 조건으로 최종 모드를 확정합니다.

```javascript
const isStoryMode = activeWritingMode === 'story';
```

관련 코드: `index.html`의 `setWritingMode()`와 글 생성 처리부

## 4. 로그인 계정의 개인 지침 조회

글을 생성하기 직전에 브라우저가 해당 계정의 개인 시스템 지침을 강제로 다시 조회합니다.

```javascript
const personalSystemInstruction = await window.TrafficCatcherUserAI
    ?.loadInstruction?.(isStoryMode ? 'story' : 'keyword', true) || '';
```

두 번째 인수 `true`는 브라우저 메모리 캐시를 사용하지 않고 DB의 최신 값을 다시 가져오라는 의미입니다.

### 키워드·뉴스 선택 시

```http
GET /api/auth/preferences/system-instruction?type=keyword
```

### 스토리·원고 선택 시

```http
GET /api/auth/preferences/system-instruction?type=story
```

Flask 서버는 현재 로그인 세션의 `user_id`와 선택된 `instruction_type`을 함께 조건으로 조회합니다.

```sql
SELECT instruction, updated_at
FROM user_ai_instructions
WHERE user_id = ?
  AND instruction_type = ?
```

따라서 다른 사용자 또는 선택하지 않은 글쓰기 유형의 지침은 반환되지 않습니다.

관련 코드:

- `static/user-ai-settings.js`
- `member_auth.py`의 `personal_system_instruction()`

## 5. 브라우저에서 로컬 Flask 서버로 전달하는 값

브라우저는 `/api/generate_content`로 다음 값을 전송합니다.

```json
{
  "keyword": "글 제목 또는 검색 키워드",
  "article_mode": "keyword 또는 story",
  "facts": "선택한 뉴스의 수집 본문",
  "source_title": "선택한 뉴스 제목",
  "source_url": "선택한 뉴스 URL",
  "portal_source": "언론사 또는 채널명",
  "story_content": "사용자가 입력한 원문",
  "story_type": "뉴스 기사형 등",
  "story_request": "추가 작성 요청",
  "persona_instruction": "활성화된 페르소나·톤앤매너 설정",
  "personal_system_instruction": "선택 유형의 계정 개인 지침",
  "model_name": "선택한 AI 모델"
}
```

| 선택 모드 | `article_mode` | `personal_system_instruction` |
|---|---|---|
| 키워드·뉴스 | `keyword` | DB의 `keyword` 개인 지침 |
| 스토리·원고 | `story` | DB의 `story` 개인 지침 |

관련 코드: `index.html`의 `/api/generate_content` 요청부

## 6. Flask 서버 처리

`portal_crawler.py`의 `/api/generate_content`는 먼저 다음 항목을 확인합니다.

1. 로그인 세션이 유효한지 확인
2. 사용자 역할에 `ai.write` 권한이 있는지 확인
3. `article_mode`, 작성 자료, 개인 지침, 페르소나 지침 분리
4. 스토리 모드라면 사용자 원문이 30자 이상인지 확인
5. `ai_studio_code.generate_article()` 호출

개인 시스템 지침은 최대 20,000자, 페르소나 지침은 최대 4,000자로 제한하여 전달합니다.

## 7. 글쓰기 유형별 기본 시스템 지침

Python 생성기는 `article_mode`에 따라 내부 기본 지침을 별도로 선택합니다.

### 키워드·뉴스

키워드·뉴스 전용 기본 지침을 사용합니다.

### 메모·스토리

메모·스토리 전용 기본 지침을 사용합니다.

절대 규칙과 지침 충돌 해결 규칙은 두 모드에 공통으로 매 요청마다 읽습니다.

관련 코드: `ai_studio_code.py`

## 8. 최종 `system_instruction` 조립 순서

최종 AI 시스템 지침은 다음 순서로 조립됩니다.

```text
[1. 절대 규칙]
내부 공통 절대 규칙
필수 출력물 형식 규칙(삽화 4컷·쇼츠 4컷)을 읽기 전용 하위 규칙으로 포함

[2. 선택된 글쓰기 유형 시스템 지침]
DB 개인 지침이 있으면 선택 유형의 개인 지침
DB 개인 지침이 없으면 선택 유형의 기본 지침 파일

[3. 페르소나·톤앤매너 지침]
AI 페르소나 설정이 활성화된 경우에만 포함

[4. 지침 충돌 해결 규칙]
내부 공통 충돌 해결 규칙
```

실제 선택 로직은 다음과 같습니다.

```python
selected_writing_instruction = (
    user_system_instruction[:20000] or service_instruction
)
```

### 중요한 현재 동작

개인 지침이 존재하면 기본 서비스 지침 뒤에 추가되는 방식이 아닙니다. 선택 모드의 개인 지침이 해당 모드의 기본 지침을 **대체**합니다.

- 개인 지침 있음 → 개인 지침 사용
- 개인 지침 없음 → 해당 모드 기본 지침 사용
- 절대 규칙과 충돌 해결 규칙 → 항상 포함
- 필수 출력물 형식 → 절대 규칙의 읽기 전용 하위 규칙으로 항상 포함
- 페르소나·톤앤매너 → 활성화한 경우 포함

## 9. 실제 작성 자료인 `input` 구성

`system_instruction`은 글쓰기 규칙이며, 실제 키워드·기사·원문은 별도의 `input`으로 전달됩니다.

### 키워드·뉴스 모드

기준 기사를 선택한 경우:

```text
[선택 키워드]
사용자가 선택한 키워드

[사용자가 선택한 기준 기사]
제목, 언론사, URL, 수집 본문

[작성 규칙]
기준 기사의 사실관계를 우선하고 없는 사실은 만들지 않기
```

기준 기사를 선택하지 않은 경우에는 키워드와 팩트 자료가 제공되지 않았다는 상태를 전달하고, 확인되지 않은 최신 사실을 만들지 않도록 요청합니다.

### 스토리·원고 모드

```text
[기사 주제 또는 제목]
사용자가 입력한 제목

[기사 작성 방향]
선택한 스토리 유형

[사용자 직접 작성 원문]
사용자가 입력한 원문

[추가 요청]
사용자의 추가 작성 요청
```

## 10. 최종 AI API 호출

```python
client.interactions.create(
    model=model_name,
    input=prompt_input,
    system_instruction=system_instruction,
    generation_config={
        "max_output_tokens": 8192,
        "thinking_level": "minimal"
    },
    store=False,
)
```

`store=False`이므로 AI 요청 저장 기능은 사용하지 않습니다.

## 11. 로컬 로그

관리자 계정으로 글을 생성한 경우에만 로컬 서버 창에 최종 조립된 시스템 지침을 출력합니다.

```text
[AI SYSTEM INSTRUCTION] type=keyword model=... length=...
최종 조립된 system_instruction 전문
[AI SYSTEM INSTRUCTION END]
```

일반 회원은 개인 지침 노출과 로그 과다 출력을 방지하기 위해 전문 로그를 출력하지 않습니다.

## 12. 현재 구조의 주의점

현재 로컬 흐름은 다음과 같습니다.

```text
계정 DB
  → 브라우저가 선택 유형의 지침 조회
  → personal_system_instruction 필드로 Flask에 전달
  → Python 생성기가 최종 지침 조립
```

프런트엔드에서 `keyword`와 `story`를 올바르게 분리하고 생성 직전 DB를 다시 조회하므로 일반적인 사용 흐름에서는 선택 유형만 전달됩니다.

다만 Flask 생성 API가 계정 DB에서 개인 지침을 직접 재조회하지 않고 브라우저가 보낸 `personal_system_instruction`을 사용하는 구조입니다. 보안과 무결성을 더 강화하려면 향후 Flask가 로그인 사용자와 `article_mode`를 기준으로 DB에서 해당 지침을 직접 조회하고, 브라우저가 전달한 지침은 사용하지 않도록 개선하는 것이 좋습니다.

## 13. 로컬 서버와 Cloudflare 운영 서버 비교

로컬 서버와 운영 서버는 사용자가 선택한 글쓰기 유형에 따라 `keyword` 또는 `story` 개인 지침 하나만 사용하는 논리는 같습니다. 차이는 최종 `system_instruction`을 조립하는 위치와 API 키 저장 위치입니다.

| 구분 | 로컬 Flask 서버 | Cloudflare 운영 서버 |
|---|---|---|
| 개인 지침 저장소 | 회원 SQLite DB | D1 `AUTH_DB` |
| 글쓰기 모드 결정 | 브라우저의 `activeWritingMode` | 브라우저의 `activeWritingMode` |
| 개인 지침 조회 | `/api/auth/preferences/system-instruction?type=...` | 동일 API를 통해 D1 조회 |
| 최종 지침 조립 | `ai_studio_code.py` | 브라우저 `index.html` |
| AI API 중계 | Flask/Python | Cloudflare Worker |
| AI API 키 | 로컬 `.env` | Cloudflare Secret `GEMINI_API_KEY` |
| 최종 지침 로그 | 관리자 계정만 로컬 서버 콘솔에 출력 | 운영 서버에서는 전문을 출력하지 않음 |
| AI 요청 저장 옵션 | `store=False` | `store:false` |

### 13.1 로컬 서버 경로

```text
SQLite에서 선택 모드 개인 지침 조회
  → 브라우저가 personal_system_instruction으로 Flask에 전달
  → Flask 로그인·ai.write 권한 검사
  → ai_studio_code.py가 절대 규칙·선택 지침·페르소나·충돌 규칙 조립
  → AI 콘텐츠 생성 요청 호출
```

로컬 Python 생성기는 `article_mode`를 기준으로 키워드 또는 스토리 기본 지침 파일을 직접 선택합니다. 개인 지침이 있으면 그 개인 지침이 기본 지침을 대체합니다.

### 13.2 Cloudflare 운영 서버 경로

```text
D1에서 선택 모드 개인 지침 조회
  → 브라우저가 절대 규칙·선택 지침·페르소나·충돌 규칙 조립
  → AI API 프록시로 전체 system_instruction 전달
  → Worker가 로그인·ai.write 권한과 API Secret 검사
  → AI 콘텐츠 생성 API로 전달
```

운영 Worker는 `system_instruction`과 `input`을 각각 최대 60,000자로 제한하고, 허용된 모델만 사용합니다. 일반 회원 응답에서는 토큰 사용량 관련 필드를 제거하며 관리자 응답에는 유지합니다.

### 13.3 공통 동작

- 키워드·뉴스 선택 시 `instruction_type=keyword`만 조회합니다.
- 스토리·원고 선택 시 `instruction_type=story`만 조회합니다.
- 반대 모드의 개인 지침을 동시에 조회하거나 합치지 않습니다.
- 개인 지침이 있으면 해당 모드 기본 지침을 대체합니다.
- 개인 지침이 없으면 해당 모드의 기본 `.md` 지침을 사용합니다.
- 절대 규칙과 충돌 해결 규칙은 항상 포함합니다.
- 페르소나·톤앤매너는 활성화한 경우에만 포함합니다.
- AI 요청 저장 기능은 사용하지 않습니다.

## 14. 운영 서버 배포 확인 결과

2026-08-26 `https://trafficcatcher.ai/` 운영 배포본을 읽기 전용으로 확인한 결과는 다음과 같습니다.

| 확인 항목 | 결과 |
|---|---|
| 메인 페이지 | HTTP 200 |
| 비로그인 `keyword` 지침 API | HTTP 401, 로그인 필요 |
| 비로그인 `story` 지침 API | HTTP 401, 로그인 필요 |
| 비로그인 AI 상태 API | HTTP 401, 로그인 필요 |
| 운영 HTML의 모드별 `loadInstruction()` 코드 | 배포 확인 |
| 운영 HTML의 최종 지침 결합 코드 | 배포 확인 |
| AI API 프록시 호출 코드 | 배포 확인 |
| 키워드 기본 지침 `.md` | HTTP 200 |
| 스토리 기본 지침 `.md` | HTTP 200 |
| 절대 규칙 `.md` | HTTP 200 |
| 충돌 해결 규칙 `.md` | HTTP 200 |

실제 로그인 계정의 D1 개인 지침 내용은 인증 세션 없이 외부에서 읽을 수 없으며, 이는 정상적인 보안 동작입니다. 코드와 비로그인 접근 차단 상태를 기준으로 운영 서버에도 모드별 분리 구조가 적용되어 있음을 확인했습니다.

## 15. 권장 보안 개선

현재 로컬과 운영 서버 모두 브라우저가 조회한 개인 지침을 생성 API 요청에 포함합니다. 운영 Worker는 브라우저가 전달한 완성된 `system_instruction`을 검증 후 AI API에 전달하지만, D1의 원본 지침과 일치하는지를 다시 확인하지는 않습니다.

따라서 개발자 도구나 별도 HTTP 요청으로 `personal_system_instruction` 또는 전체 `system_instruction`을 임의 변경할 가능성이 남아 있습니다. 다음 구조로 개선하는 것이 가장 안전합니다.

```text
브라우저는 article_mode와 작성 자료만 전달
  → Flask 또는 Worker가 로그인 사용자 확인
  → 서버가 사용자 ID + article_mode로 개인 지침 직접 조회
  → 서버가 절대 규칙·선택 지침·페르소나·충돌 규칙 조립
  → AI API 호출
```

이렇게 변경하면 로그인 계정에 저장된 지침과 실제 AI API에 전달된 지침의 일치 여부를 서버가 보장할 수 있고, 로컬과 운영 환경의 조립 위치도 서버 측으로 통일할 수 있습니다.
