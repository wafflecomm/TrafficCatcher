# -*- coding: utf-8 -*-
"""
Google AI Studio System Instructions 기반 블로그 수익화 & SEO 마스터 에이전트
- 모델: models/gemini-2.5-flash (Google AI Studio 최신 권장 모델)
- SDK: google-genai (최신 공식 SDK) 및 REST API v1beta 동시 지원
- 키워드 속성 자동 판별: 이슈/트렌드형(TREND), 정보/스테디형(INFO), 리뷰/상업형(REVIEW)
- 출력: 1,500자~2,000자 이상의 고밀도 파워블로거 완성 기사 + 3대 광고 배치 + 쇼츠 4컷 스토리보드
"""

import os
import sys
import json
import re
from datetime import datetime

SYSTEM_INSTRUCTION = """# Google AI Studio System Instructions: 실시간 검색 & 유튜브 기반 블로그 수익화 & SEO 마스터 에이전트

## 1. 역할 정의 (Role & Persona)
당신은 대한민국 대표 포털(네이버, 다음) 및 글로벌 검색엔진(구글)의 상위 노출(SEO) 규칙을 완벽하게 파악하고 있는 **'수석 블로그 마케팅 전문가 및 고효율 카피라이터'**이자 인기 인플루언서입니다. 
당신의 목표는 실시간 검색 및 유튜브 영상으로 수집된 실제 팩트 데이터를 정밀 분석하여, 단순한 정보 요약을 넘어 독자의 마음을 사로잡는 친근한 어투로 글을 작성하며, **체류 시간 극대화**와 **광고 수익(애드센스, 애드포스트) 최적화**를 이끌어내는 고품질 블로그 기사를 자동 생산하는 것입니다.

## 2. 키워드 속성 3대 분류 및 맞춤 작성 전략 (Keyword Classification Strategy)
입력된 키워드와 팩트의 맥락을 분석하여 다음 3가지 유형 중 가장 적합한 맞춤형 전략으로 기사를 전개합니다:

### ① 이슈/트렌드형 (TREND)
- **키워드 특징**: 실시간 검색어, 긴급 속보, 방송/연예, 사회적 사건 사고, 화제의 인물 등.
- **오프닝 톤**: "이웃님들, 반가워요! 💖 매일 쏟아지는 수많은 이슈 속에서 오늘 실시간 검색어를 가장 뜨겁게 달구고 있는 화제의 주인공, 바로 **'{keyword}'** 소식입니다! ✨ 여러 포털과 뉴스 피드에서 계속 오르내리고 있어서 '도대체 무슨 일이지?' 하고 궁금하셨을 텐데요. 제가 수집된 실제 팩트와 핵심 쟁점만을 쏙쏙 뽑아 나노 단위로 완벽하게 정리해 드릴게요! 😉"
- **본문 구성**: 
  1. 도대체 무슨 일일까? 사건 발생 배경과 핵심 팩트 🔍
  2. 언론사별 3대 핵심 관점 교차 분석 & 팩트 체크 표 📊 (현안 중심 / 파급 효과 / 심층 분석)
  3. 앞으로 어떻게 될까? 파급 효과와 전문가 심층 전망 💡

### ② 정보/스테디형 (INFO)
- **키워드 특징**: 방법, 신청, 조회, 조건, 기간, 일정, 자격, 팁, 해결, 사용법, 주의사항, 서류, 혜택, 지원금, 세금, 부동산, 증시, 주식, 종목, 법안, 제도 등.
- **오프닝 톤**: "이웃님들, 반가워요! 💖 일상에서 꼭 알아두면 돈이 되고 힘이 되는 알짜배기 알찬 정보를 전해드리는 시간입니다! 오늘 다뤄볼 주제는 많은 분들이 문의를 주셨던 **'{keyword}'** 완벽 가이드인데요. 놓치기 쉬운 세부 조건부터 실제 팩트, 신청 절차, 일정까지 하나도 빠짐없이 꼼꼼하게 챙겨드릴 테니 끝까지 집중해 주세요! 🚀"
- **본문 구성**: 
  1. 꼭 알아야 하는 핵심 이유! 개요와 주요 변경사항 📋
  2. 한눈에 보는 비교 분석 도표 & 필수 체크리스트 📊 (지원 대상 / 신청 조건 / 핵심 혜택)
  3. 실패 없이 100% 혜택 챙기는 실전 꿀팁 & 전문가 조언 💡

### ③ 리뷰/상업형 (REVIEW)
- **키워드 특징**: 후기, 리뷰, 가격, 구매, 할인, 내돈내산, 비교, 추천, 스펙, 단점, 장점, 사용기, 가성비, 출시, 신제품 등.
- **오프닝 톤**: "이웃님들, 반가워요! 💖 요즘 커뮤니티와 SNS에서 '내돈내산' 솔직 후기와 함께 가장 핫하게 언급되는 **'{keyword}'** 정밀 분석 리뷰를 들고 왔어요! ✨ 실제 구매나 선택을 고민 중이신 분들을 위해 장점부터 숨겨진 단점, 가성비 및 스펙 비교까지 가감 없이 솔직 담백하게 파헤쳐 드립니다! 🛍️"
- **본문 구성**: 
  1. 화제의 중심! 스펙과 실제 관심 배경 🔍
  2. 경쟁 모델 및 대안과의 정밀 비교 분석 표 📊 (주요 스펙 / 실사용 장점 / 주의할 단점)
  3. 후회 없는 선택을 위한 최종 구매 가이드 & 총평 💡

## 3. 필수 글쓰기 규칙 (Formatting & SEO Rules)
- **글자 수 보장**: 정보의 깊이와 체류시간 확보를 위해 **최소 1,500자 이상(권장 2,000자 이상)**의 넉넉하고 알찬 분량으로 작성합니다.
- **HTML 구조화**: 제목과 본문은 마크다운 헤딩(`#`, `##`, `####`) 및 목록, 인용구를 논리적으로 사용합니다.
- **독창성 확보**: 기계적이고 뻔한 문체를 배제하고, 실제 구어체와 공감대 형성 표현을 가미하여 독창성을 극대화합니다.

## 4. 광고 수익 최적화 배치 설계 (Ad Monetization Layout)
- **제목 아래 1단락 후**: 요약 단락 직후 첫 번째 광고 자리 확보 <!-- [광고 삽입 포인트 1: 제목 아래 1단락 후] -->
- **본문 중간 (상세 비교표 아래)**: 체류시간이 누적되는 핵심 도표 아래 광고 자리 확보 <!-- [광고 삽입 포인트 2: 상세 비교표 아래 본문 중반] -->
- **글 하단 결론 위**: 마무리 요약 단락 직전 광고 자리 확보 <!-- [광고 삽입 포인트 3: 에디터 코멘트 직전 하단] -->

## 5. 최종 콘텐츠 출력 템플릿 (Output Layout)

---
### [블로그 제목 추천]
1. **[메인 타이틀 1]** (🔥 핵심 팩트 중심형)
2. **[메인 타이틀 2]** (💡 궁금증과 호기심 유발형)
3. **[메인 타이틀 3]** (🎯 체류시간을 극대화하는 완벽 정리형)

---
### [본문 원고]

#### 📌 바쁜 분들을 위한 3초 핵심 포인트 요약
- **핵심 포인트 1**: 실시간 팩트 1
- **핵심 포인트 2**: 실시간 팩트 2
- **핵심 포인트 3**: 실시간 팩트 3

#### 🔗 실시간 참고 보도 및 팩트 출처 (Fact Sources)
- 📌 **출처 1 (언론사/채널명)**: [실시간 속보 바로가기](URL_1)
- 📌 **출처 2 (언론사/채널명)**: [공식 보도 바로가기](URL_2)
- 📌 **출처 3 (언론사/채널명)**: [심층 분석 바로가기](URL_3)

---

#### 1. [소제목 h2: 키워드 속성에 맞춘 매력적인 오프닝 타이틀]
[속성별 맞춤형 인플루언서 인트로 인사말]

[실시간 수집된 실제 뉴스 팩트 및 배경 스토리텔링]

> 📌 **실시간 핵심 보도 인용**:
> "[실제 보도된 핵심 팩트 문장 인용]"

[사안의 실질적인 파급력과 검증된 타임라인 설명]

<!-- [광고 삽입 포인트 1: 제목 아래 1단락 후] -->

---

#### 2. [소제목 h2: 핵심 쟁점 및 속성별 3대 비교 분석 표]
[단 하나의 시선에 치우치지 않고 객관적으로 비교 분석하는 가이드 문단]

| 분석 관점 | 실제 보도 팩트 및 핵심 쟁점 | 대중 반응 및 공식 입장 |
| :--- | :--- | :--- |
| **관점 A (현안/스펙/조건)** | ... | ... |
| **관점 B (파급력/장단점/혜택)** | ... | ... |
| **관점 C (심층분석/대안/주의점)** | ... | ... |

[비교표 해설 및 시사점 분석]

<!-- [광고 삽입 포인트 2: 상세 비교표 아래 본문 중반] -->

---

#### 3. [소제목 h2: 파급 효과 및 독자 맞춤형 실전 체크포인트]
[독자가 실생활에서 반드시 기억해야 할 3대 실천 가이드라인]
1. **[실천 팁 1]**: ...
2. **[실천 팁 2]**: ...
3. **[실천 팁 3]**: ...

<!-- [광고 삽입 포인트 3: 에디터 코멘트 직전 하단] -->

---

#### 💡 에디터의 한 줄 코멘트 & 마무리
> "빠르게 흘러가는 수많은 뉴스 속에서도, 팩트의 본질을 꿰뚫어 보는 안목이 가장 든든한 무기입니다."

[인플루언서 특유의 따뜻한 소통 멘트 및 공감(❤️), 이웃 추가, 댓글 유도]

---

#### 🏷️ 추천 태그 (복사해서 사용)
`#{keyword}` `#{keyword}총정리` `#{keyword}팩트체크` `#{keyword}이슈` `#실시간트렌드` `#오늘의뉴스` `#정보공유` `#트렌드분석` `#블로그수익화` `#일상꿀팁`

---
### [쇼츠 4컷 스토리보드 9:16]
[1컷] 0~2초 (속보 훅) | 역할: 시선을 사로잡는 긴급 속보 훅 | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration, Modern clean 3D isometric and cinematic vector illustration, 9:16 vertical aspect ratio...
[2컷] 3~5초 (사건 경위) | 역할: 실제 사건 경위 및 팩트 전달 | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration, Split-screen glassmorphism interface...
[3컷] 6~8초 (핵심 해설) | 역할: 핵심 쟁점 해설과 솔루션 | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration, Clear factual solution...
[4컷] 9~12초 (CTA) | 역할: 피날레 & 행동 유도 CTA | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration, Clean minimalist vertical frame with 3D floating icons...
"""

def detect_keyword_type(keyword, detail="", article_text=""):
    """
    키워드, 상세 내용 및 기사 텍스트를 기반으로 속성 자동 판별
    - REVIEW: 리뷰/상업형 (후기, 리뷰, 가격, 구매, 할인, 내돈내산, 비교, 추천, 스펙, 단점, 장점, 사용기, 가성비, 출시, 신제품 등)
    - INFO: 정보/스테디형 (방법, 신청, 조회, 조건, 기간, 일정, 자격, 팁, 해결, 사용법, 주의사항, 서류, 혜택, 지원금, 세금, 부동산, 증시, 주식, 종목, 법안, 제도 등)
    - TREND: 이슈/트렌드형 (실시간 속보, 사건/이슈 등 기본값)
    """
    combined = f"{keyword} {detail} {article_text}".lower()
    
    # 1. 리뷰/상업형 키워드 패턴
    review_patterns = ['후기', '리뷰', '가격', '구매', '할인', '내돈내산', '비교', '추천', '스펙', '단점', '장점', '사용기', '가성비', '출시', '신제품']
    if any(p in combined for p in review_patterns):
        return 'REVIEW', '리뷰/상업형'
        
    # 2. 정보/스테디형 키워드 패턴
    info_patterns = ['방법', '신청', '조회', '조건', '기간', '일정', '자격', '팁', '해결', '사용법', '주의사항', '서류', '혜택', '지원금', '세금', '부동산', '증시', '주식', '종목', '법안', '제도']
    if any(p in combined for p in info_patterns):
        return 'INFO', '정보/스테디형'
        
    # 3. 기본값: 이슈/트렌드형
    return 'TREND', '이슈/트렌드형'

def parse_shorts_from_markdown(text):
    """생성된 마크다운 텍스트에서 쇼츠 4컷 스토리보드 항목 추출"""
    cuts = []
    lines = text.split('\n')
    for line in lines:
        match = re.search(r'\[(\d)컷\]\s*([^\|]+)\|\s*역할:\s*([^\|]+)\|\s*콘셉트:\s*([^\|]+)\|\s*Prompt:\s*(.+)', line)
        if match:
            c_num = int(match.group(1))
            c_time = match.group(2).strip()
            c_role = match.group(3).strip()
            c_concept = match.group(4).strip()
            c_prompt = match.group(5).strip()
            cuts.append({
                "cut": c_num,
                "time": c_time,
                "role": c_role,
                "concept_ko": c_concept,
                "prompt_ko": f"9:16 세로 비율. {c_concept}, 시네마틱 3D 벡터 일러스트레이션, 8k 해상도",
                "prompt_en": c_prompt
            })
    return cuts

def generate_article(keyword="김민석, 호남 과반 승리", facts="", portal_source="포털 통합", api_key=None, model_name="gemini-2.5-flash", return_dict=False):
    """
    Google AI Studio Gemini 최신 SDK(google-genai) 또는 REST API v1beta를 통해 실시간 기사 작성
    
    Parameters:
        keyword (str): 핵심 키워드
        facts (str): 실시간 기사 팩트 또는 상세 정보
        portal_source (str): 포털 출처 명칭
        api_key (str): Gemini API 키 (미지정 시 GEMINI_API_KEY 환경변수 사용)
        model_name (str): 사용할 Gemini 모델명 (기본: gemini-2.5-flash)
        return_dict (bool): True일 경우 웹/API 연동용 딕셔너리 패키지 반환, False일 경우 생성된 마크다운 텍스트 반환
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    k_type, k_type_name = detect_keyword_type(keyword, facts, facts)

    if not key:
        if not return_dict:
            print("[안내] GEMINI_API_KEY 환경변수가 설정되지 않았습니다. API 키를 입력하거나 환경변수로 지정해 주세요.")
            try:
                key = input("Google AI Studio API Key 입력: ").strip()
            except (EOFError, KeyboardInterrupt):
                key = ""
        
        if not key:
            if return_dict:
                from ai_generator import generate_ai_content
                return generate_ai_content(keyword, "", portal_source, facts)
            else:
                print("[오류] API 키가 제공되지 않아 작업을 종료합니다.")
                return ""

    prompt_text = f"""[사용자 입력 정보]
- 키워드: "{keyword}"
- 포털 출처: "{portal_source}"
- 감지된 콘텐츠 속성: [{k_type_name} ({k_type})]
- 상세 및 실시간 팩트 정보:
\"\"\"
{facts or '최신 실시간 검색 트렌드 및 공식 보도 팩트를 기반으로 작성해 주세요.'}
\"\"\"

[핵심 실행 지침]
위 실시간 팩트와 키워드를 바탕으로, System Instructions에 정의된 [{k_type_name}] 레이아웃 규칙에 따라 [블로그 제목 추천] 3가지와 [본문 원고] (1,500~2,000자 이상 고품질 파워블로거 완성 기사 + 3대 광고 삽입 포인트 + 3대 관점 비교표 + 에디터 코멘트 + 참고 보도 출처 + 추천 태그) 및 [쇼츠 4컷 스토리보드 9:16]를 완벽하게 작성해 주세요."""

    generated_text = ""
    target_model = model_name if model_name.startswith('models/') else f"models/{model_name}"
    clean_model = model_name.replace('models/', '')

    # 1. 최신 공식 google-genai SDK 호출 시도
    try:
        from google import genai
        client = genai.Client(api_key=key)
        
        response = client.models.generate_content(
            model=target_model,
            contents=prompt_text,
            config={
                'system_instruction': SYSTEM_INSTRUCTION,
                'temperature': 1.0,
                'max_output_tokens': 65536,
                'top_p': 0.95,
            }
        )
        generated_text = response.text or ""
        if generated_text and not return_dict:
            print("\n" + "=" * 60)
            print(f"🚀 Google AI Studio (Gemini SDK - {target_model}) 기사 작성 완료 [{k_type_name}]: '{keyword}'")
            print("=" * 60 + "\n")
            print(generated_text)
    except Exception as sdk_err:
        # SDK 실패 시 REST API v1beta 직접 호출 진행
        pass

    # 2. REST API v1beta 직접 호출 (SDK 미설치 또는 SDK 실패 시)
    if not generated_text:
        try:
            import requests
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={key}"
            resp = requests.post(
                endpoint,
                headers={"Content-Type": "application/json"},
                json={
                    "system_instruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
                    "contents": [{"role": "user", "parts": [{"text": prompt_text}]}],
                    "generationConfig": {
                        "temperature": 1.0,
                        "topP": 0.95,
                        "maxOutputTokens": 65536
                    }
                },
                timeout=30
            )
            if resp.status_code == 200:
                data = resp.json()
                generated_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if generated_text and not return_dict:
                    print("\n" + "=" * 60)
                    print(f"🚀 Google AI Studio (Gemini REST API - {clean_model}) 기사 작성 완료 [{k_type_name}]: '{keyword}'")
                    print("=" * 60 + "\n")
                    print(generated_text)
            else:
                if not return_dict:
                    print(f"[오류] API 호출 실패: HTTP {resp.status_code} - {resp.text}")
        except Exception as rest_err:
            if not return_dict:
                print(f"[오류] REST API 통신 실패: {rest_err}")

    # 결과가 없으면 로컬 제너레이터로 폴백
    if not generated_text:
        from ai_generator import generate_ai_content
        fallback = generate_ai_content(keyword, "", portal_source, facts)
        if return_dict:
            return fallback
        return fallback.get("blog_post_markdown", "")

    # 웹/API 호출용 딕셔너리 반환 요청 시 포맷팅
    if return_dict:
        from ai_generator import markdown_to_html, generate_ai_content
        fallback_pkg = generate_ai_content(keyword, "", portal_source, facts)
        
        parsed_shorts = parse_shorts_from_markdown(generated_text)
        final_shorts = parsed_shorts if len(parsed_shorts) == 4 else fallback_pkg.get("shorts_storyboard", [])

        # 제목 3선 추출
        titles = []
        for line in generated_text.split('\n'):
            line_str = line.strip()
            if re.match(r'^\d+\.\s*\*\*', line_str) or (line_str.startswith('- ') and len(titles) < 3 and '제목' not in line_str):
                clean_title = re.sub(r'^\d+\.\s*', '', line_str).replace('**', '').strip('- ').strip()
                if clean_title and len(clean_title) > 5:
                    titles.append(clean_title)
            if len(titles) >= 3:
                break
        
        if len(titles) < 3:
            titles = fallback_pkg.get("title_options", [])

        return {
            "keyword": keyword,
            "keyword_type": k_type,
            "keyword_type_name": f"🚀 Gemini ({clean_model}) - {k_type_name}",
            "reading_time": "3분 30초",
            "core_intent": f"Google AI Studio Gemini ({clean_model}) 실시간 AI 창작 원고 ({k_type_name})",
            "title_options": titles,
            "blog_post_markdown": generated_text,
            "blog_post_html": markdown_to_html(generated_text),
            "shorts_storyboard": final_shorts,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

    return generated_text

if __name__ == '__main__':
    target_keyword = sys.argv[1] if len(sys.argv) > 1 else "김민석, 호남 과반 승리"
    target_facts = sys.argv[2] if len(sys.argv) > 2 else ""
    generate_article(keyword=target_keyword, facts=target_facts)
