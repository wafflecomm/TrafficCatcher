import os
import sys
import re
from google import genai

SYSTEM_INSTRUCTION_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "skills",
    "google-ai-studio-system-instructions.md",
)


def load_system_instruction():
    """기획 문서를 단일 원본으로 사용한다."""
    with open(SYSTEM_INSTRUCTION_PATH, "r", encoding="utf-8") as f:
        return f.read().strip()


FALLBACK_SYSTEM_INSTRUCTION = '''# Google AI Studio System Instructions: 실시간 검색 & 유튜브 기반 블로그 수익화 & SEO 마스터 에이전트

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

## 7. 말투 및 톤앤매너 (Tone & Voice)
- 기본적으로 **"이웃님들, 반가워요! 💖"**로 시작하는 따뜻하고 통통 튀는 인기 인플루언서의 말투를 유지합니다.
- 문장 사이사이에 이모지(Emoji)를 적극적으로 활용해 시각적 피로도를 없애고 읽는 재미를 줍니다.
- 복잡한 정보도 초보자가 단숨에 이해할 수 있도록 나노 단위로 구체적이고 상냥하게 설명합니다.
'''

try:
    SYSTEM_INSTRUCTION = load_system_instruction()
except OSError:
    SYSTEM_INSTRUCTION = FALLBACK_SYSTEM_INSTRUCTION

generation_config = {
    'max_output_tokens': 8192,
    'thinking_level': 'minimal',
}

def detect_keyword_type(keyword):
    review_words = ('후기', '리뷰', '가격', '구매', '할인', '비교', '추천', '스펙', '가성비', '출시')
    info_words = ('방법', '신청', '조회', '조건', '기간', '일정', '자격', '사용법', '지원금', '세금', '주식')
    if any(word in keyword for word in review_words):
        return 'REVIEW', '🛍️ 리뷰/상업형'
    if any(word in keyword for word in info_words):
        return 'INFO', '📘 정보/스테디형'
    return 'TREND', '🔥 이슈/트렌드형'


def _fallback_shorts_storyboard(keyword):
    """모델 출력 형식이 흔들려도 반드시 사용할 수 있는 4컷 프롬프트를 제공한다."""
    scenes = [
        (1, '0~2초 (속보 훅)', '시선을 사로잡는 긴급 속보 훅', f"'{keyword}' 핵심 키워드가 스마트폰 속보 화면에서 강하게 떠오르는 장면"),
        (2, '3~5초 (사건 경위)', '사건의 배경과 핵심 팩트 전달', f"'{keyword}' 관련 사건 흐름을 타임라인과 뉴스 자료로 보여주는 장면"),
        (3, '6~8초 (핵심 해설)', '핵심 쟁점과 의미를 쉽게 해설', f"'{keyword}' 핵심 쟁점을 데이터 차트와 강조 아이콘으로 분석하는 장면"),
        (4, '9~12초 (CTA)', '핵심 요약과 행동 유도', f"'{keyword}' 요약 카드와 구독·공유 행동 유도 문구로 마무리하는 장면"),
    ]
    return [
        {
            'cut': cut,
            'time': time,
            'role': role,
            'conceptKo': concept,
            'promptEn': (
                'A vertical 9:16 cinematic editorial storyboard illustration about '
                f'"{keyword}", scene {cut}: {concept}, Korean news social media style, '
                'clear focal point, dynamic composition, clean typography-safe space, '
                'realistic lighting, ultra detailed, no watermark, 8k.'
            ),
        }
        for cut, time, role, concept in scenes
    ]


def _parse_shorts_storyboard(text, keyword):
    marker = re.search(r'#{0,6}\s*\[?쇼츠\s*4컷[^\n]*', text, re.IGNORECASE)
    shorts_text = text[marker.start():] if marker else ''
    pattern = re.compile(
        r'\[(\d)\s*컷\]\s*([^|\n]*)\|\s*역할\s*:\s*([^|\n]*)'
        r'\|\s*콘셉트\s*:\s*([^|\n]*)\|\s*(?:Prompt|프롬프트)\s*:\s*([^\n]+)',
        re.IGNORECASE,
    )
    parsed = []
    for match in pattern.finditer(shorts_text):
        parsed.append({
            'cut': int(match.group(1)),
            'time': match.group(2).strip(),
            'role': match.group(3).strip(),
            'conceptKo': match.group(4).strip(),
            'promptEn': match.group(5).strip().strip('`'),
        })
    if len(parsed) != 4:
        return _fallback_shorts_storyboard(keyword)
    return sorted(parsed, key=lambda item: item['cut'])


def _to_result_dict(keyword, text):
    keyword_type, keyword_type_name = detect_keyword_type(keyword)
    title_section = re.search(r'\[블로그 제목 추천\]([\s\S]*?)(?:\n#{1,6}\s|\Z)', text)
    title_options = []
    if title_section:
        title_options = [
            re.sub(r'^[-*\d.\s]+', '', line).strip()
            for line in title_section.group(1).splitlines()
            if re.match(r'^\s*(?:[-*]|\d+[.)])\s+', line)
        ][:3]
    shorts_marker = re.search(r'#{0,6}\s*\[?쇼츠\s*4컷', text, re.IGNORECASE)
    blog_text = text[:shorts_marker.start()].strip() if shorts_marker else text.strip()
    return {
        'keyword': keyword,
        'keyword_type': keyword_type,
        'keyword_type_name': keyword_type_name,
        'title_options': title_options,
        'blog_post_markdown': blog_text,
        'blog_post_html': '',
        'shorts_storyboard': _parse_shorts_storyboard(text, keyword),
    }


def generate_article(keyword="실시간 핫이슈", facts="", portal_source="포털 통합",
                     api_key=None, model_name="gemini-3.5-flash-lite", return_dict=False):
    """
    Google AI Studio Interactions API를 통해 실시간 기사 작성
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Google AI Studio API Key가 필요합니다.")
    try:
        system_instruction = load_system_instruction()
    except OSError:
        system_instruction = FALLBACK_SYSTEM_INSTRUCTION
    # Gemini 사용자 입력에는 선택된 키워드 값만 전달한다.
    # 기사 형식과 작성 규칙은 system_instruction에서만 관리한다.
    prompt_input = str(keyword or "").strip()
    if not prompt_input:
        raise ValueError("기사 작성 키워드가 필요합니다.")

    try:
        client = genai.Client(api_key=key)
        interaction = client.interactions.create(
            model=model_name,
            input=prompt_input,
            system_instruction=system_instruction,
            generation_config={
                'max_output_tokens': 8192,
                'thinking_level': 'minimal',
            },
            store=False,
        )
        text = interaction.output_text or ""
        if not text:
            raise RuntimeError("Gemini API가 빈 응답을 반환했습니다.")
        return _to_result_dict(keyword, text) if return_dict else text
    except Exception as e:
        raise RuntimeError(f"Gemini API 호출 실패: {e}") from e


def revise_article(keyword, original_markdown, revision_request, api_key=None,
                   model_name="gemini-3.5-flash-lite"):
    """완성된 기사를 사용자의 보완 요청에 맞춰 전체 문맥 단위로 다시 편집한다."""
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise ValueError("Google AI Studio API Key가 필요합니다.")
    if not str(original_markdown or "").strip():
        raise ValueError("보완할 기존 기사 원문이 필요합니다.")
    if not str(revision_request or "").strip():
        raise ValueError("기사 보완 요청을 입력해 주세요.")
    try:
        base_instruction = load_system_instruction()
    except OSError:
        base_instruction = FALLBACK_SYSTEM_INSTRUCTION

    revision_instruction = base_instruction + '''

# 기존 기사 보완 편집 규칙
- 사용자의 보완 요청을 기존 기사 문맥에 자연스럽게 통합합니다.
- 제목, 문체, SEO 구조, 기존 핵심 정보와 추천 태그를 최대한 유지합니다.
- 중복 문장과 상충하는 내용을 제거하고 완성된 전체 마크다운 기사만 출력합니다.
- 참고 보도 및 팩트 출처 링크를 임의로 만들거나 변조하지 않습니다.
- "추가 내용"이라는 별도 임시 섹션을 만들지 않습니다.
'''
    revision_input = (
        f"선택 키워드: {str(keyword or '').strip()}\n\n"
        f"[현재 기사 원문]\n{str(original_markdown).strip()}\n\n"
        f"[사용자 보완 요청]\n{str(revision_request).strip()}"
    )
    try:
        client = genai.Client(api_key=key)
        interaction = client.interactions.create(
            model=model_name,
            input=revision_input,
            system_instruction=revision_instruction,
            generation_config={'max_output_tokens': 8192, 'thinking_level': 'minimal'},
            store=False,
        )
        text = (interaction.output_text or "").strip()
        text = re.sub(r'^```(?:markdown|md)?\s*', '', text, flags=re.I)
        text = re.sub(r'\s*```$', '', text).strip()
        if not text:
            raise RuntimeError("Gemini가 보완된 기사 본문을 반환하지 않았습니다.")
        return {'keyword': keyword, 'blog_post_markdown': text, 'blog_post_html': ''}
    except Exception as e:
        raise RuntimeError(f"Gemini 기사 보완 실패: {e}") from e

if __name__ == '__main__':
    target_keyword = sys.argv[1] if len(sys.argv) > 1 else "BTS"
    target_facts = sys.argv[2] if len(sys.argv) > 2 else ""
    
    print(f"🚀 Google AI Studio (gemini-3.5-flash-lite) 기사 생성 시작: '{target_keyword}'")
    result = generate_article(keyword=target_keyword, facts=target_facts)
    if result:
        print("\n" + "=" * 60)
        print(result)
        print("=" * 60 + "\n")
    else:
        print("❌ 기사 작성에 실패했습니다. GEMINI_API_KEY 환경변수 또는 인자를 확인해 주세요.")
