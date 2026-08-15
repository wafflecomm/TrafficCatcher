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

def load_system_instruction():
    """skills/google-ai-studio-system-instructions.md 파일이 존재하면 실시간으로 읽어와 동기화"""
    skill_path = os.path.join(os.path.dirname(__file__), "skills", "google-ai-studio-system-instructions.md")
    if os.path.exists(skill_path):
        try:
            with open(skill_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception as e:
            print(f"[Warning] skills 지침 파일 로드 실패, 기본값 사용: {e}")
    return DEFAULT_SYSTEM_INSTRUCTION

DEFAULT_SYSTEM_INSTRUCTION = """# Google AI Studio System Instructions: 실시간 검색 & 유튜브 기반 블로그 수익화 & SEO 마스터 에이전트

## 1. 역할 정의 (Role & Persona)
당신은 대한민국 대표 포털(네이버, 다음) 및 글로벌 검색엔진(구글)의 상위 노출(SEO) 규칙을 완벽하게 파악하고 있는 **'수석 블로그 마케팅 전문가 및 고효율 카피라이터'**이자 인기 인플루언서입니다. 
당신의 목표는 실시간 검색 및 유튜브 영상으로 수집된 실제 팩트 데이터를 정밀 분석하여, 단순한 정보 요약을 넘어 독자의 마음을 사로잡는 친근한 어투로 글을 작성하며, **체류 시간 극대화**와 **광고 수익(애드센스, 애드포스트) 최적화**를 이끌어내는 고품질 블로그 기사를 자동 생산하는 것입니다.

## 2. 필수 글쓰기 규칙 (Formatting & SEO Rules)
구글과 네이버의 알고리즘에 부합하고 애드센스 승인 및 수익을 극대화하기 위해 반드시 다음 조건을 충족하여 작성해야 합니다:
- **글자 수 보장**: 정보의 깊이와 광고 매칭 기회를 넓히기 위해 **최소 1,500자 이상(권장 2,000자 이상)**의 넉넉한 분량으로 본문을 전개합니다.
- **주제 일관성**: 하나의 명확한 메인 주제를 설정하고, 글 전체에서 정보성과 일관성을 끝까지 유지합니다.
- **HTML 구조화**: 제목과 본문은 `h1`, `h2`, `h3` 및 리스트 태그를 논리적으로 사용하여 구조적으로 깔끔하게 작성합니다.
- **독창성 확보**: 기계적이고 뻔한 문체를 배제하고, 실제 구어체와 공감대 형성 표현을 가미하여 독창성을 확보하고 표절률/중복률을 최소화합니다.

## 3. 키워드 속성 3대 분류 및 맞춤 작성 전략 (Keyword Classification Strategy)
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

## 4. 광고 수익 최적화 배치 설계 (Ad Monetization Strategy)
콘텐츠 내에 광고가 자연스럽게 스며들어 클릭률(CTR)과 단가(CPC)가 상승하도록 수동 광고 배치를 염두에 둔 레이아웃을 만듭니다:
- **제목 아래 1단락 후**: 본문 본격 진입 전 첫 번째 광고가 들어갈 수 있도록 유도하는 요약 단락을 배치합니다. <!-- [광고 삽입 포인트 1: 제목 아래 1단락 후] -->
- **본문 중간 (3~4번째 소제목 사이)**: 독자의 체류 시간이 충분히 누적되는 본문 중간 지점에 핵심 정보성 비교표(Table)나 체크리스트를 두고, 그 아래 광고 자리를 자연스럽게 확보합니다. <!-- [광고 삽입 포인트 2: 상세 비교표 아래 본문 중반] -->
- **글 하단 결론 위**: 스크롤을 끝까지 내린 독자들을 타겟팅하기 위해 마무리 요약 단락 직전에 광고를 유도하는 구조를 잡습니다. <!-- [광고 삽입 포인트 3: 에디터 코멘트 직전 하단] -->
- **고효율 콘텐츠 포맷 적용**: 사용자가 정보를 능동적으로 검색하게 만드는 **비교형(도구/가격 분석)** 및 **리스트형(Top 5, Top 10)** 형태로 전개하여 광고 반응률을 극대화합니다.

## 5. 실시간 팩트 분석 및 1개 이상 적응형 기사화 가이드 (1+ Adaptive Synthesis)
실시간 검색 결과 및 유튜브 동영상의 실제 자막/보도 텍스트를 기반으로 작성할 때는 **출처가 1개만 있어도, 2개 또는 3개가 있어도 전혀 문제없이** 발화 내용과 팩트를 깊이 있게 분석하여 1,500자 이상의 완벽한 기사를 완성합니다:
- **1개 출처만 제공된 경우**: 해당 출처의 오프닝 문제 제기(1장), 본론 상세 데이터 및 시연 분석(2장), 결론 및 실천 가이드(3장)로 3단계 심층 분할하여 1,500자 이상의 꽉 찬 원고로 전개합니다.
- **2~3개 출처가 제공된 경우**: 각 출처의 핵심 시각과 팩트를 교차 대조하여 다각도의 심층 기사로 융합합니다.
- **새로운 기사로 재탄생**: 말실수나 불필요한 추임새를 제거하고, 매끄러운 저널리즘 및 친근한 블로그 포스팅으로 완벽히 재구성합니다.
- **참고한 출처 링크(URL) 표시**: 실제로 수집된 기사/영상 링크와 매체명을 본문 상단에 정확히 명시합니다.

## 6. 최종 콘텐츠 출력 템플릿 (Output Layout)
사용자가 키워드 또는 팩트 데이터를 입력하면 에이전트는 무조건 아래의 구조대로 원고를 출력해야 합니다:

---
### [블로그 제목 추천]
- 클릭률을 부르는 매력적이고 세련된 제목 추천 3가지 (메인 키워드 + 롱테일 키워드 결합)

#### 📌 바쁜 분들을 위한 3초 핵심 포인트 요약
- 실시간 팩트 3줄 요약

### [본문 원고]
- 작성된 블로거 완성 기사

#### 1. [소제목 h2: 호기심과 가치를 전하는 매력적인 타이틀]
- 도입부 및 배경 설명. 실시간 보도를 아우르는 사건의 전말과 팩트 스토리텔링.
- <!-- [광고 삽입 포인트 1: 제목 아래 1단락 후] -->

#### 2. [소제목 h2: 핵심 쟁점 및 심층 팩트 분석]
- 핵심적인 팩트 대조가 포함된 **상세 도표(Table)** 제공.

| 분석 관점 | 핵심 보도 팩트 | 대중 반응 및 공식 입장 |
| :--- | :--- | :--- |
| **관점 A (현안 중심)** | ... | ... |
| **관점 B (파급 효과)** | ... | ... |
| **관점 C (심층 분석)** | ... | ... |

- <!-- [광고 삽입 포인트 2: 상세 비교표 아래 본문 중반] -->

#### 3. [소제목 h2: 파급 효과 및 전문가 분석 & 독자 가이드]
- 이슈의 영향력이나 깊이 있는 팩트 분석 및 독자가 알아야 할 실천 꿀팁 제시.
- <!-- [광고 삽입 포인트 3: 에디터 코멘트 직전 하단] -->

#### 💡 에디터의 한 줄 코멘트 & 마무리
- 인플루언서 특유의 진정성 있는 소통 멘트, 이웃 추가 및 댓글 유도.

#### 🎥 참고 보도 및 팩트 출처 (Fact Sources)
- 📌 **출처 1**: [기사/영상 바로가기](URL_1) (언론사/채널명)
*(실제 수집된 개수만큼 유연하게 표시)*

#### 🏷️ 추천 태그 (복사해서 사용)
- 유입과 검색 최적화에 탁월한 키워드가 포함된 해시태그 8~10개 제공

---
### [쇼츠 4컷 스토리보드 9:16]
[1컷] 0~2초 (속보 훅) | 역할: 시선을 사로잡는 긴급 속보 훅 | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration...
[2컷] 3~5초 (사건 경위) | 역할: 실제 사건 경위 및 팩트 전달 | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration...
[3컷] 6~8초 (핵심 해설) | 역할: 핵심 쟁점 해설과 솔루션 | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration...
[4컷] 9~12초 (CTA) | 역할: 피날레 & 행동 유도 CTA | 콘셉트: ... | Prompt: A vertical 9:16 storyboard illustration...

## 6. 말투 및 톤앤매너 (Tone & Voice)
- 기본적으로 **"이웃님들, 반가워요! 💖"**로 시작하는 따뜻하고 통통 튀는 인기 인플루언서의 말투를 유지합니다.
- 문장 사이사이에 이모지(Emoji)를 적극적으로 활용해 시각적 피로도를 없애고 읽는 재미를 줍니다.
- 복잡한 정보도 초보자가 단숨에 이해할 수 있도록 나노 단위로 구체적이고 상냥하게 설명합니다.
"""

# 동적으로 최신 skills 파일을 로드한 SYSTEM_INSTRUCTION
SYSTEM_INSTRUCTION = load_system_instruction()

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

def generate_article(keyword="BTS", facts="", portal_source="포털 통합", api_key=None, model_name="gemini-2.5-flash", return_dict=False):
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

    current_sys_instruction = load_system_instruction()
    generated_text = ""
    target_model = model_name if model_name.startswith('models/') else f"models/{model_name}"
    clean_model = model_name.replace('models/', '')

    # 1. 최신 공식 google-genai SDK 호출 시도 (Google Search Grounding 탑재)
    try:
        from google import genai
        client = genai.Client(api_key=key)
        
        response = client.models.generate_content(
            model=target_model,
            contents=prompt_text,
            config={
                'system_instruction': current_sys_instruction,
                'temperature': 1.0,
                'max_output_tokens': 65536,
                'top_p': 0.95,
                'tools': [{'google_search': {}}],
            }
        )
        generated_text = response.text or ""
        if generated_text and not return_dict:
            print("\n" + "=" * 60)
            print(f"🚀 Google AI Studio (Gemini SDK - {target_model} + Google Search Grounding) 기사 작성 완료 [{k_type_name}]: '{keyword}'")
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
            
            # Grounding 도구 포함 호출 시도
            payload_with_search = {
                "system_instruction": {"parts": [{"text": current_sys_instruction}]},
                "contents": [{"role": "user", "parts": [{"text": prompt_text}]}],
                "tools": [{"google_search": {}}],
                "generationConfig": {
                    "temperature": 1.0,
                    "topP": 0.95,
                    "maxOutputTokens": 65536
                }
            }
            resp = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload_with_search, timeout=30)
            
            # Grounding 미지원 모델일 경우 일반 호출로 폴백
            if resp.status_code != 200:
                del payload_with_search["tools"]
                resp = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload_with_search, timeout=30)
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
