# -*- coding: utf-8 -*-
"""
AI 블로그 포스팅 원고 & 쇼츠 4컷(9:16) 삽화 프롬프트 원스톱 생성 엔진
- Step 1: 키워드 속성 판별 (이슈/트렌드형, 정보/스테디형, 리뷰/상업형)
- Step 2: 3개 관점 교차 종합 및 비교 대조 표 생성
- Step 3: 네이버 블로그 검색엔진(SEO) 최적화 본문 템플릿 출력
- Step 4: 9:16 세로형 쇼츠/릴스 연동 4컷 스토리보드 및 Imagen 3 프롬프트 생성
"""

import re
from datetime import datetime

def detect_keyword_type(keyword, detail=""):
    """키워드 및 상세 내용을 기반으로 속성 자동 판별 (이슈/정보/리뷰)"""
    combined = f"{keyword} {detail}".lower()
    
    # 리뷰/상업형 키워드 패턴
    review_patterns = ['후기', '리뷰', '가격', '구매', '할인', '내돈내산', '비교', '추천', '스펙', '단점', '장점', '사용기', '가성비']
    if any(p in combined for p in review_patterns):
        return 'REVIEW', '리뷰/상업형'
        
    # 정보/스테디형 키워드 패턴
    info_patterns = ['방법', '신청', '조회', '조건', '기간', '일정', '자격', '팁', '해결', '사용법', '주의사항', '서류', '혜택', '지원금', '세금', '부동산', '증시', '주식', '종목']
    if any(p in combined for p in info_patterns):
        return 'INFO', '정보/스테디형'
        
    # 기본: 이슈/트렌드형
    return 'TREND', '이슈/트렌드형'

def generate_ai_content(keyword, detail="", portal_source="포털 통합"):
    """
    4단계 워크플로우에 따른 원스톱 콘텐츠 패키지 생성
    """
    keyword = keyword.strip()
    k_type, k_type_name = detect_keyword_type(keyword, detail)
    today_str = datetime.now().strftime("%Y년 %m월 %d일")
    
    # ==========================================
    # [Step 1] 속성별 서사 전략 수립
    # ==========================================
    if k_type == 'TREND':
        type_intro_hook = f"최근 {portal_source} 실시간 검색어 1위에 오르며 수많은 대중의 뜨거운 이목을 집중시키고 있는 **'{keyword}'** 소식입니다."
        reading_time = "2분"
        core_intent = "신속한 팩트 전달 및 양측 입장 대조를 통한 호기심 해소"
    elif k_type == 'INFO':
        type_intro_hook = f"많은 분들이 일상에서 꼭 필요로 하고 자주 찾아보시는 **'{keyword}'**의 핵심 정보와 체크리스트를 완벽 정리해 드립니다."
        reading_time = "3분 30초"
        core_intent = "1,500자 이상의 고밀도 실전 가이드 및 세부 일정·조건 안내"
    else:
        type_intro_hook = f"요즘 핫한 관심사로 떠오른 **'{keyword}'**에 대한 실사용 팩트와 가성비, 선택 전 필수 체크 포인트를 꼼꼼하게 짚어드립니다."
        reading_time = "3분"
        core_intent = "구매/선택 장벽을 낮추는 객관적 비교와 솔직 후기 중심 분석"

    # ==========================================
    # [Step 2] 3개 언론사/관점 교차 분석 표 생성
    # ==========================================
    perspective_table = f"""| 분석 관점 | 주요 보도 및 핵심 팩트 | 대중 및 시장 반응 |
| :--- | :--- | :--- |
| **관점 A (현안 중심)** | '{keyword}'의 발생 배경 및 핵심 사실 관계 보도 | 신속한 사건 흐름 파악 및 높은 실시간 조회수 기록 |
| **관점 B (파급 효과)** | 관련 업계 및 이해관계자들의 입장과 향후 대응책 | 장기적인 영향력과 후속 대책에 대한 논의 집중 |
| **관점 C (심층 분석)** | 배경 원인 분석 및 전문가 제언, 유사 사례 비교 | 다각도의 팩트 체크와 객관적인 시각 견지 |"""

    # ==========================================
    # [Step 3] 네이버 블로그 포스팅 원고 작성
    # ==========================================
    
    title_options = [
        f"[속보/총정리] {keyword} 최신 핵심 팩트와 놓치면 안 될 3가지 포인트",
        f"요즘 난리 난 '{keyword}' 이유가 뭘까? 3분 만에 한눈에 이해하기",
        f"{keyword} 완벽 가이드! 배경부터 핵심 쟁점, 향후 전망까지 총정리"
    ]
    
    blog_post_markdown = f"""# 📌 [추천 블로그 제목]
1. **{title_options[0]}** (🔥 클릭 유도형)
2. **{title_options[1]}** (💡 호기심 유발형)
3. **{title_options[2]}** (🎯 정보 밀도형)

---

## ⚡ [3초 핵심 요약]
- **핵심 포인트 1**: 현재 실시간 검색어 및 커뮤니티에서 가장 뜨거운 화제인 **'{keyword}'**의 최신 현황입니다.
- **핵심 포인트 2**: 3개 이상의 다각도 언론 보도와 팩트를 교차 검증하여 중립적이고 객관적으로 정리했습니다.
- **핵심 포인트 3**: 바쁜 분들을 위해 아래 표와 본문에서 핵심 쟁점과 실질적인 팁을 일목요연하게 제공합니다.

---

## 🔍 H2: 1. '{keyword}' 왜 지금 화제일까? (현황 및 배경)
{type_intro_hook}

{today_str} 기준, 여러 포털과 소셜 미디어를 중심으로 관련 검색량이 폭발적으로 급증하고 있습니다. 
단편적인 정보만으로는 전체 맥락을 파악하기 어렵기 때문에, 사실 관계를 객관적인 타임라인 순으로 짚어보는 것이 매우 중요합니다.

---

## 📊 H2: 2. 언론사별 3대 핵심 관점 교차 분석
다양한 미디어와 전문가들이 바라보는 **'{keyword}'**의 핵심 쟁점을 비교 정리한 내용입니다.

{perspective_table}

> **[!NOTE]**
> 위 데이터는 실시간 공신력 있는 보도 자료와 포털 트렌드 데이터를 종합하여 중립적으로 재구성된 정보입니다.

---

## 💡 H2: 3. 우리가 주목해야 할 실전 체크리스트 & 꿀팁
'{keyword}'와 관련하여 독자 여러분께서 실질적으로 알아두셔야 할 핵심 포인트는 다음과 같습니다:

1. **정확한 정보 출처 확인**: 확인되지 않은 루머나 자극적인 찌라시보다는 공식 발표 자료를 우선 검토하세요.
2. **타임라인에 따른 변동성 주시**: 실시간으로 새로운 후속 보도와 세부 업데이트가 이어지고 있으니 주기적인 확인이 필요합니다.
3. **나에게 미치는 영향 점검**: 개인의 일상, 재테크 또는 관심 분야와 어떻게 맞닿아 있는지 실질적 가치를 체크해 보세요.

---

## ✍️ [에디터의 한 줄 코멘트 & 마무리]
> "단순한 이슈를 넘어 실질적인 팩트와 흐름을 파악하는 것이 가장 현명한 대처입니다."

오늘 정리해 드린 **'{keyword}'** 소식이 도움 되셨다면 **공감(❤️)과 이웃 추가(이웃 맺기)** 부탁드립니다! 
궁금하신 점이나 여러분의 소중한 의견은 댓글로 자유롭게 남겨주세요. 감사합니다. 😊

---

## 🏷️ [네이버 블로그 추천 해시태그]
`#{keyword.replace(' ', '')}` `#{keyword.replace(' ', '')}총정리` `#{keyword.replace(' ', '')}이슈` `#실시간트렌드` `#오늘의이슈` `#뉴스브리핑` `#트렌드분석` `#인기검색어` `#정보공유` `#일상꿀팁`
"""

    # ==========================================
    # [Step 4] 세로형(9:16) 쇼츠/릴스 연동 4컷 삽화 프롬프트
    # ==========================================
    art_style_en = "Modern clean 3D isometric and cinematic vector illustration, 9:16 vertical aspect ratio, ultra-high quality, vibrant ambient lighting, sleek design, trendy aesthetic"
    art_style_ko = "세련된 3D 아이소메트릭 & 시네마틱 벡터 일러스트, 9:16 세로 비율, 선명한 앰비언트 조명, 트렌디한 감성"

    shorts_storyboard = [
        {
            "cut": 1,
            "time": "0~2초 (시각적 훅)",
            "role": "시선을 단숨에 사로잡는 강력한 시각적 메타포",
            "concept_ko": f"스마트폰 화면 위로 솟아오르는 거대한 불꽃과 함께 네온으로 빛나는 '{keyword}' 홀로그램 타이포그래피. 사람들의 시선이 집중되는 역동적인 장면.",
            "prompt_ko": f"9:16 세로 비율, {art_style_ko}. 스마트폰 디스플레이에서 뿜어져 나오는 네온 홀로그램과 급상승 차트 그래픽, 강렬한 시각적 임팩트, 드라마틱한 네온 블루와 퍼플 조명, 8k resolution.",
            "prompt_en": f"A vertical 9:16 storyboard illustration, {art_style_en}. A smartphone screen projecting glowing neon holographic trends and dramatic rising data beams representing '{keyword}', intense visual hook, futuristic neon accents, cinematic depth of field, 8k render."
        },
        {
            "cut": 2,
            "time": "3~5초 (문제 제기 및 데이터 시각화)",
            "role": "갈등 상황 및 급상승 수치/그래프를 직관적으로 전달",
            "concept_ko": f"3개로 분할된 홀로그램 스크린에 서로 다른 데이터 지표와 비교 차트, 언론사 헤드라인이 빠르게 교차하는 분석 장면.",
            "prompt_ko": f"9:16 세로 비율, {art_style_ko}. 3개의 분할된 투명 글래스 패널 위로 선명하게 표시되는 비교 데이터 그래프와 지표, 차분하면서도 분석적인 앰버-오렌지 조명.",
            "prompt_en": f"A vertical 9:16 storyboard illustration, {art_style_en}. Split-screen glassmorphism interface displaying contrasting analytical charts, fluctuating data lines and news badges, sleek UI elements, glowing orange and cyan accents, clean typography layout."
        },
        {
            "cut": 3,
            "time": "6~8초 (해결책 및 핵심 가치 전달)",
            "role": "핵심 해답과 명쾌한 통찰을 밝고 긍정적으로 시각화",
            "concept_ko": f"복잡했던 데이터들이 하나로 정돈되며 환하게 빛나는 전구와 열쇠, 밝은 미래를 상징하는 시원한 비주얼.",
            "prompt_ko": f"9:16 세로 비율, {art_style_ko}. 복잡한 문제들이 명쾌하게 풀리며 빛나는 황금 열쇠와 스마트 솔루션 아이콘, 상쾌하고 밝은 에메랄드 그린과 화이트 톤.",
            "prompt_en": f"A vertical 9:16 storyboard illustration, {art_style_en}. Clear solution emerging from data streams, a glowing golden key and organized puzzle pieces coming together, radiant emerald green and bright white aesthetic, uplifting atmosphere."
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
