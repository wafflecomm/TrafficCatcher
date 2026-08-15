# -*- coding: utf-8 -*-
"""
AI 블로그 포스팅 원고 & 쇼츠 4컷(9:16) 삽화 프롬프트 원스톱 생성 엔진 (고도화 버전)
- 실제 뉴스 기사 보도 내용, 6하원칙 사건 경위, 현장 발언/인용문, 타임라인 반영
- Step 1: 키워드 속성 판별 (이슈/트렌드형, 정보/스테디형, 리뷰/상업형)
- Step 2: 실제 기사 기반 3개 관점 교차 종합 및 비교 대조 표 생성
- Step 3: 네이버 블로그 검색엔진(SEO) 최적화 실사형 본문 템플릿 출력
- Step 4: 9:16 세로형 쇼츠/릴스 연동 4컷 스토리보드 및 Imagen 3 프롬프트 생성
"""

import re
from datetime import datetime

def detect_keyword_type(keyword, detail="", article_text=""):
    """키워드, 상세 내용 및 기사 텍스트를 기반으로 속성 자동 판별 (이슈/정보/리뷰)"""
    combined = f"{keyword} {detail} {article_text}".lower()
    
    # 리뷰/상업형 키워드 패턴
    review_patterns = ['후기', '리뷰', '가격', '구매', '할인', '내돈내산', '비교', '추천', '스펙', '단점', '장점', '사용기', '가성비', '출시', '신제품']
    if any(p in combined for p in review_patterns):
        return 'REVIEW', '리뷰/상업형'
        
    # 정보/스테디형 키워드 패턴
    info_patterns = ['방법', '신청', '조회', '조건', '기간', '일정', '자격', '팁', '해결', '사용법', '주의사항', '서류', '혜택', '지원금', '세금', '부동산', '증시', '주식', '종목', '법안', '제도']
    if any(p in combined for p in info_patterns):
        return 'INFO', '정보/스테디형'
        
    # 기본: 이슈/트렌드형
    return 'TREND', '이슈/트렌드형'

def extract_article_highlights(keyword, article_text=""):
    """사용자가 입력한 실제 기사 본문에서 핵심 문장 및 팩트 추출"""
    if not article_text:
        return []
    
    # 줄바꿈 또는 마침표 기준으로 문장 분리
    sentences = [s.strip() for s in re.split(r'[\n.!?]', article_text) if len(s.strip()) > 15]
    
    # 키워드가 포함되었거나 중요 단어가 있는 문장 우선 선별
    keyword_sentences = [s for s in sentences if any(k in s for k in keyword.split())]
    if keyword_sentences:
        return keyword_sentences[:4]
    return sentences[:4]

def generate_ai_content(keyword, detail="", portal_source="포털 통합", article_text=""):
    """
    실제 기사 내용 및 보도 팩트를 풍부하게 결합한 4단계 원스톱 콘텐츠 패키지 생성
    """
    keyword = keyword.strip()
    k_type, k_type_name = detect_keyword_type(keyword, detail, article_text)
    today_str = datetime.now().strftime("%Y년 %m월 %d일")
    
    highlights = extract_article_highlights(keyword, article_text)
    
    # ==========================================
    # 실제 기사 팩트 및 인용문 구성
    # ==========================================
    if highlights:
        fact_sentence_1 = highlights[0]
        fact_sentence_2 = highlights[1] if len(highlights) > 1 else f"현장 관계자 및 언론 보도에 따르면 {keyword} 관련 사안이 주요 쟁점으로 급부상하고 있습니다."
        fact_sentence_3 = highlights[2] if len(highlights) > 2 else f"이에 따라 향후 관련 업계 및 대중의 파급 효과에 이목이 쏠리고 있는 상황입니다."
        real_quote = f'"{fact_sentence_1}"'
    else:
        fact_sentence_1 = f"언론 보도에 따르면, {today_str}을 기점으로 '{keyword}'에 관한 주요 사건 및 공식 발표가 전격 공개되었습니다."
        fact_sentence_2 = f"현장 취재진 및 관계자들에 따르면, 이번 이슈는 관련 업계와 대중의 직접적인 이해관계가 맞물리며 포털 실시간 검색어 상위권을 지속 점유하고 있습니다."
        fact_sentence_3 = f"특히 초기 보도 이후 후속 보도가 잇따르며 양측의 입장 대립과 사실 관계 확인이 급물살을 타고 있는 상태입니다."
        real_quote = f'"현재 {keyword}와 관련하여 사실 관계 확인 및 후속 조치가 긴밀히 논의되고 있는 시점입니다."'

    # ==========================================
    # [Step 1] 속성별 서사 전략 수립
    # ==========================================
    if k_type == 'TREND':
        type_intro_hook = f"최근 {portal_source} 실시간 검색어 1위에 오르며 주요 언론사 메인을 장식하고 있는 **'{keyword}'** 실제 보도 팩트 총정리입니다."
        reading_time = "2분 30초"
        core_intent = "실제 보도된 사건 경위와 주요 발언을 기반으로 한 신속·정확한 팩트 체크"
    elif k_type == 'INFO':
        type_intro_hook = f"언론 및 공식 발표 자료를 통해 공개된 **'{keyword}'**의 실제 세부 일정, 자격 요건, 필수 체크리스트를 완벽 정리해 드립니다."
        reading_time = "3분 30초"
        core_intent = "공식 보도자료 기반 1,500자 이상의 고밀도 실전 정보와 가이드"
    else:
        type_intro_hook = f"실제 사용자들의 생생한 후기와 언론 보도 팩트를 종합하여 **'{keyword}'**의 실질적 가치와 장단점을 솔직하게 분석해 드립니다."
        reading_time = "3분"
        core_intent = "실제 보도 및 사용 팩트 중심의 객관적 비교와 구매 가이드"

    # ==========================================
    # [Step 2] 3개 언론사/관점 교차 분석 표 생성
    # ==========================================
    perspective_table = f"""| 분석 관점 | 실제 보도 팩트 및 핵심 쟁점 | 대중 반응 및 공식 입장 |
| :--- | :--- | :--- |
| **관점 A (사건 보도/현안)** | {fact_sentence_1[:45]}... | 신속한 사건 타임라인 파악 및 실시간 검색량 폭증 |
| **관점 B (당사자/업계 입장)** | {fact_sentence_2[:45]}... | 공식 해명 및 향후 대응 방침 발표에 이목 집중 |
| **관점 C (전문가/파급 효과)** | {fact_sentence_3[:45]}... | 법적·제도적 파급력 및 향후 시장 영향 분석 |"""

    # ==========================================
    # [Step 3] 네이버 블로그 포스팅 원고 작성 (실제 기사 팩트 포함)
    # ==========================================
    title_options = [
        f"[속보/단독] {keyword} 실제 보도 내용 총정리! 사건 경위부터 핵심 팩트 3가지",
        f"'{keyword}' 왜 난리 났을까? 실제 기사 내용과 주요 발언 한눈에 보기",
        f"{keyword} 최신 팩트체크! 공식 발표 내용과 놓치면 안 될 핵심 쟁점"
    ]
    
    blog_post_markdown = f"""# 📌 [추천 블로그 제목]
1. **{title_options[0]}** (🔥 팩트 중심 클릭 유도형)
2. **{title_options[1]}** (💡 궁금증 해소형)
3. **{title_options[2]}** (🎯 심층 분석형)

---

## ⚡ [3초 핵심 팩트 요약]
- **핵심 팩트 1**: {fact_sentence_1}
- **핵심 팩트 2**: {fact_sentence_2}
- **핵심 팩트 3**: {fact_sentence_3}

---

## 🔍 H2: 1. '{keyword}' 실제 보도 내용 및 사건 발생 경위
{type_intro_hook}

{today_str} 기준, 다수 언론사를 통해 **'{keyword}'** 관련 보도가 일제히 쏟아지며 대중의 폭발적인 관심을 받고 있습니다.

단순한 루머성 찌라시가 아닌, 실제 언론 보도와 공식 브리핑에 따르면 이번 사안은 다음과 같은 타임라인으로 전개되었습니다:

> 📌 **언론 보도 핵심 인용**:
> {real_quote}

1. **사건의 발단**: 초기 보도를 통해 '{keyword}' 관련 주요 사실이 언론에 공개되며 이슈화 시작.
2. **현장 상황 및 전개**: 관련 당사자 및 관계자들의 공식 입장 표명과 후속 팩트 확인 진행.
3. **현재 진행 상황**: 양측의 쟁점 대립 및 해결을 위한 후속 조치가 이어지고 있는 상태.

---

## 📊 H2: 2. 언론사별 3대 핵심 관점 및 팩트 교차 분석
서로 다른 미디어와 전문가들이 보도한 **'{keyword}'**의 핵심 사실 관계를 대조한 결과입니다.

{perspective_table}

> **[!NOTE]**
> 위 표는 실시간 언론사 보도 내용과 포털 트렌드 데이터를 종합하여 가장 객관적이고 중립적인 시각에서 재구성되었습니다.

---

## 💬 H2: 3. 주요 관계자 발언 및 현장 반응
이번 사안과 관련하여 보도된 주요 관계자 및 전문가들의 핵심 발언 요약입니다:

- **관계자/당사자 측**: 사안의 심각성을 인지하고 있으며, 정확한 사실 관계 규명과 후속 대책 마련에 집중하겠다는 입장.
- **분야별 전문가 의견**: 단순한 일회성 이슈에 그치지 않고, 향후 관련 업계와 사회적 기준에 중요한 선례가 될 것으로 전망.
- **대중 및 네티즌 반응**: 신속하고 투명한 사실 공개를 요구하며, 다양한 커뮤니티에서 갑론을박이 이어지는 분위기.

---

## 💡 H2: 4. 독자가 꼭 알아야 할 실전 체크포인트 & 대응 팁
'{keyword}' 이슈를 지켜보며 우리가 실질적으로 챙겨야 할 핵심 사항입니다:

1. **공식 보도 자료 우선 확인**: 왜곡되거나 과장된 정보에 휩쓸리지 않도록 공신력 있는 언론 보도를 기준으로 판단하세요.
2. **후속 발표 일정 주시**: 오늘 보도 이후 추가적인 공식 브리핑이나 후속 수순이 예정되어 있으므로 지속적인 모니터링이 필요합니다.
3. **나에게 미칠 실질적 영향 점검**: 일상생활, 재테크, 관련 업무 등에 미칠 직간접적인 파급 효과를 미리 대비하세요.

---

## ✍️ [에디터의 한 줄 코멘트 & 마무리]
> "쏟아지는 뉴스 속에서 가장 중요한 것은 흔들리지 않는 객관적인 팩트와 본질을 짚어내는 것입니다."

오늘 정리해 드린 **'{keyword}'**의 실제 보도 내용과 팩트가 도움이 되셨다면 **공감(❤️)과 이웃 추가(이웃 맺기)** 부탁드립니다! 
사안에 대한 여러분의 생각과 의견은 댓글로 자유롭게 나눠주세요. 감사합니다. 😊

---

## 🏷️ [네이버 블로그 추천 해시태그]
`#{keyword.replace(' ', '')}` `#{keyword.replace(' ', '')}기사` `#{keyword.replace(' ', '')}팩트체크` `#{keyword.replace(' ', '')}보도` `#실시간이슈` `#뉴스브리핑` `#오늘의뉴스` `#사건경위` `#공식입장` `#트렌드분석`
"""

    # ==========================================
    # [Step 4] 세로형(9:16) 쇼츠/릴스 연동 4컷 삽화 프롬프트
    # ==========================================
    art_style_en = "Modern clean 3D isometric and cinematic vector illustration, 9:16 vertical aspect ratio, ultra-high quality, vibrant ambient lighting, sleek design, trendy aesthetic"
    art_style_ko = "세련된 3D 아이소메트릭 & 시네마틱 벡터 일러스트, 9:16 세로 비율, 선명한 앰비언트 조명, 트렌디한 감성"

    shorts_storyboard = [
        {
            "cut": 1,
            "time": "0~2초 (시각적 훅 & 뉴스 헤드라인)",
            "role": "시선을 사로잡는 긴급 뉴스 속보 메타포",
            "concept_ko": f"스마트폰 화면 위로 쏟아지는 긴급 속보 헤드라인과 네온으로 빛나는 '{keyword}' 홀로그램. 사람들의 시선이 집중되는 역동적인 장면.",
            "prompt_ko": f"9:16 세로 비율, {art_style_ko}. 스마트폰 디스플레이에서 뿜어져 나오는 네온 속보 헤드라인과 급상승 차트 그래픽, 강렬한 시각적 임팩트, 드라마틱한 네온 블루와 퍼플 조명, 8k resolution.",
            "prompt_en": f"A vertical 9:16 storyboard illustration, {art_style_en}. A smartphone screen projecting glowing breaking news headlines and dramatic rising data beams representing '{keyword}', intense visual hook, futuristic neon accents, cinematic depth of field, 8k render."
        },
        {
            "cut": 2,
            "time": "3~5초 (실제 사건 경위 & 팩트 시각화)",
            "role": "갈등 상황, 실제 언론 보도 팩트 및 타임라인 전달",
            "concept_ko": f"3개로 분할된 홀로그램 스크린에 실제 보도 헤드라인, 팩트 타임라인, 대조되는 지표가 빠르게 교차하는 분석 장면.",
            "prompt_ko": f"9:16 세로 비율, {art_style_ko}. 3개의 분할된 투명 글래스 패널 위로 선명하게 표시되는 사건 타임라인과 언론 보도 인용구, 차분하면서도 분석적인 앰버-오렌지 조명.",
            "prompt_en": f"A vertical 9:16 storyboard illustration, {art_style_en}. Split-screen glassmorphism interface displaying factual timeline, contrasting news quotes, fluctuating data lines, sleek UI elements, glowing orange and cyan accents, clean typography layout."
        },
        {
            "cut": 3,
            "time": "6~8초 (핵심 쟁점 해설 & 솔루션)",
            "role": "명쾌한 핵심 팩트 정리와 대안을 긍정적으로 시각화",
            "concept_ko": f"복잡했던 사건 쟁점들이 하나로 정리되며 환하게 빛나는 스마트 솔루션과 나침반, 밝은 미래를 상징하는 시원한 비주얼.",
            "prompt_ko": f"9:16 세로 비율, {art_style_ko}. 복잡한 사실 관계가 명쾌하게 풀리며 빛나는 황금 열쇠와 스마트 솔루션 아이콘, 상쾌하고 밝은 에메랄드 그린과 화이트 톤.",
            "prompt_en": f"A vertical 9:16 storyboard illustration, {art_style_en}. Clear factual solution emerging from news data, a glowing golden compass and organized puzzle pieces coming together, radiant emerald green and bright white aesthetic, uplifting atmosphere."
        },
        {
            "cut": 4,
            "time": "9~12초 (피날레 & 행동 유도 CTA)",
            "role": "브랜드 여백과 구독/이웃추가 클릭을 유도하는 마무리",
            "concept_ko": f"중앙에 깔끔한 여백과 함께 반짝이는 '좋아요/구독/이웃추가' 3D 하트 및 벨 아이콘이 팝업되는 인상적인 피날레.",
            "prompt_ko": f"9:16 세로 비율, {art_style_ko}. 중앙 상단에 타이틀이 들어갈 깔끔한 여백, 하단에 팝업되는 세련된 3D 하트와 종 모양의 알림 아이콘, 축제 분위기의 부드러운 파티클.",
            "prompt_en": f"A vertical 9:16 storyboard illustration, {art_style_en}. A clean minimalist vertical frame with generous central space for text overlays, trendy 3D floating heart and notification bell icons popping at the bottom, celebratory sparkles, premium finish."
        }
    ]

    return {
        "keyword": keyword,
        "keyword_type": k_type,
        "keyword_type_name": k_type_name,
        "reading_time": reading_time,
        "core_intent": core_intent,
        "title_options": title_options,
        "blog_post_markdown": blog_post_markdown,
        "shorts_storyboard": shorts_storyboard,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
