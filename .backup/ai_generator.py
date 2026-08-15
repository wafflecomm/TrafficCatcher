# -*- coding: utf-8 -*-
"""
Google AI Studio System Instructions 기반 블로그 수익화 & SEO 마스터 에이전트 생성 엔진
- 역할: 수석 블로그 마케팅 전문가 & 고효율 카피라이터 (인기 인플루언서 페르소나)
- 글자 수 보장: 1,500자 ~ 2,000자 이상의 고밀도 체류시간 극대화 본문
- 톤앤매너: "이웃님들, 반가워요! 💖" 통통 튀는 친근한 구어체 & 풍부한 이모지
- 광고 수익 최적화: 제목 아래(1), 본문 비교표 아래(2), 결론 직전(3) 3대 광고 슬롯 설계
- 3대 관점 교차 분석: 관점 A(현안 중심), 관점 B(파급 효과), 관점 C(심층 분석) 상세 도표(Table) 제공
- 쇼츠 4컷 스토리보드 및 Imagen 3 프롬프트 연동
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
    
    sentences = [s.strip() for s in re.split(r'[\n.!?]', article_text) if len(s.strip()) > 15]
    keyword_sentences = [s for s in sentences if any(k in s for k in keyword.split())]
    if keyword_sentences:
        return keyword_sentences[:4]
    return sentences[:4]

def markdown_to_html(md_text):
    """마크다운 텍스트를 네이버 블로그 및 웹 호환 HTML 코드로 변환 (광고 슬롯 및 서식 포함)"""
    lines = md_text.split('\n')
    html_lines = []
    in_table = False
    in_list = False
    
    for line in lines:
        stripped = line.strip()
        
        # 광고 삽입 포인트 주석 및 안내 박스 변환
        if '<!-- [광고 삽입 포인트' in stripped:
            ad_label = stripped.replace('<!--', '').replace('-->', '').strip()
            html_lines.append(f"""<div style="margin: 1.8rem 0; padding: 1.2rem; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; text-align: center; color: #64748b; font-size: 0.85rem; font-weight: 600;">
  📢 {ad_label}
</div>""")
            continue
            
        # 헤딩 태그
        if stripped.startswith('# '):
            html_lines.append(f"<h1 style='color: #0f172a; font-size: 1.5rem; margin: 1.5rem 0 1rem 0; border-bottom: 2px solid #3b82f6; padding-bottom: 0.4rem;'>{stripped[2:]}</h1>")
            continue
        elif stripped.startswith('## ') or stripped.startswith('#### '):
            title_text = re.sub(r'^#+\s*', '', stripped)
            html_lines.append(f"<h2 style='color: #1e293b; font-size: 1.25rem; margin: 1.4rem 0 0.8rem 0; border-left: 4px solid #2563eb; padding-left: 0.6rem;'>{title_text}</h2>")
            continue
        elif stripped.startswith('### '):
            html_lines.append(f"<h3 style='color: #334155; font-size: 1.1rem; margin: 1.2rem 0 0.6rem 0;'>{stripped[4:]}</h3>")
            continue
            
        # 구분선
        if stripped == '---':
            html_lines.append("<hr style='border: 0; border-top: 1px solid #e2e8f0; margin: 1.8rem 0;'>")
            continue
            
        # 인용구
        if stripped.startswith('> '):
            quote_content = stripped[2:]
            html_lines.append(f"<blockquote style='border-left: 4px solid #ec4899; padding: 0.8rem 1.2rem; background-color: #fdf2f8; margin: 1.2rem 0; border-radius: 6px; color: #831843; font-style: italic; line-height: 1.7;'>{quote_content}</blockquote>")
            continue
            
        # 표 (Table)
        if stripped.startswith('|') and stripped.endswith('|'):
            cells = [c.strip() for c in stripped[1:-1].split('|')]
            if all(set(c).issubset({'-', ':', ' '}) for c in cells):
                continue
            if not in_table:
                in_table = True
                html_lines.append("<table style='width: 100%; border-collapse: collapse; margin: 1.4rem 0; font-size: 0.92rem; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);'>")
                html_lines.append("<thead><tr style='background: linear-gradient(135deg, #f1f5f9, #e2e8f0);'>")
                for c in cells:
                    html_lines.append(f"<th style='border: 1px solid #cbd5e1; padding: 0.75rem 0.9rem; text-align: left; font-weight: 700; color: #0f172a;'>{c}</th>")
                html_lines.append("</tr></thead><tbody>")
            else:
                html_lines.append("<tr>")
                for c in cells:
                    html_lines.append(f"<td style='border: 1px solid #cbd5e1; padding: 0.7rem 0.9rem; color: #334155;'>{c}</td>")
                html_lines.append("</tr>")
            continue
        else:
            if in_table:
                in_table = False
                html_lines.append("</tbody></table>")
                
        # 리스트
        if stripped.startswith('- ') or stripped.startswith('* '):
            item = stripped[2:]
            if not in_list:
                in_list = True
                html_lines.append("<ul style='padding-left: 1.5rem; margin: 0.6rem 0; line-height: 1.8; color: #334155;'>")
            html_lines.append(f"<li style='margin-bottom: 0.35rem;'>{item}</li>")
            continue
        elif re.match(r'^\d+\.\s', stripped):
            item = re.sub(r'^\d+\.\s', '', stripped)
            if not in_list:
                in_list = True
                html_lines.append("<ol style='padding-left: 1.5rem; margin: 0.6rem 0; line-height: 1.8; color: #334155;'>")
            html_lines.append(f"<li style='margin-bottom: 0.35rem;'>{item}</li>")
            continue
        else:
            if in_list:
                in_list = False
                html_lines.append("</ul>")
                
        if stripped:
            html_lines.append(f"<p style='margin: 0.85rem 0; line-height: 1.85; color: #1e293b; font-size: 1rem;'>{stripped}</p>")
            
    if in_table:
        html_lines.append("</tbody></table>")
    if in_list:
        html_lines.append("</ul>")
        
    full_html = '\n'.join(html_lines)
    full_html = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color: #0f172a; font-weight: 700;">\1</strong>', full_html)
    full_html = re.sub(r'`(.+?)`', r'<code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #2563eb; font-weight: 600;">\1</code>', full_html)
    return full_html

def generate_ai_content(keyword, detail="", portal_source="포털 통합", article_text=""):
    """
    Google AI Studio System Instructions 규격에 맞춘 1,500~2,000자 이상 고밀도 블로그 원고 생성
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
        fact_sentence_2 = highlights[1] if len(highlights) > 1 else f"현장 관계자 및 취재진에 따르면 이번 {keyword} 사안은 사회적 관심과 파급력이 상당한 것으로 파악되었습니다."
        fact_sentence_3 = highlights[2] if len(highlights) > 2 else f"이에 따라 향후 관련 업계의 대응 및 제도적 보완 조치에 이목이 쏠리고 있습니다."
        real_quote = f'"{fact_sentence_1}"'
    else:
        fact_sentence_1 = f"주요 언론 보도에 따르면, {today_str}을 기점으로 '{keyword}'에 관한 공식 발표 및 핵심 사건 경위가 일제히 공개되었습니다."
        fact_sentence_2 = f"현장 취재진 및 관계자들에 따르면, 이번 이슈는 관련 업계와 대중의 직접적인 관심사가 맞물리며 포털 실시간 검색어 상위권을 지속 점유하고 있습니다."
        fact_sentence_3 = f"초기 보도 이후 심층 후속 기사들이 이어지며 양측의 입장 대립과 사실 관계 확인이 급물살을 타고 있는 상태입니다."
        real_quote = f'"현재 {keyword}와 관련하여 사실 관계 확인 및 후속 조치가 긴밀히 논의되고 있는 시점입니다."'

    # ==========================================
    # [Step 1] 속성별 맞춤형 인플루언서 인트로
    # ==========================================
    if k_type == 'TREND':
        intro_greeting = f"이웃님들, 반가워요! 💖 매일 쏟아지는 수많은 이슈 속에서 오늘 실시간 검색어를 뜨겁게 달구고 있는 주인공, 바로 **'{keyword}'** 소식입니다! ✨ 여러 포털과 뉴스 피드에서 계속 오르내리고 있어서 '도대체 무슨 일이지?' 하고 궁금하셨을 텐데요. 제가 핵심만 쏙쏙 뽑아 나노 단위로 완벽하게 정리해 드릴게요! 😉"
        sub_title_1 = f"1. 도대체 무슨 일일까? '{keyword}' 사건 발생 배경과 핵심 팩트 🔍"
        sub_title_2 = f"2. 언론사별 3대 핵심 관점 교차 분석 & 팩트 체크 표 📊"
        sub_title_3 = f"3. 앞으로 어떻게 될까? 파급 효과와 전문가 심층 전망 💡"
    elif k_type == 'INFO':
        intro_greeting = f"이웃님들, 반가워요! 💖 일상에서 꼭 알아두면 돈이 되고 힘이 되는 알짜배기 꿀팁을 전해드리는 시간입니다! 오늘 다뤄볼 주제는 많은 분들이 문의를 남겨주셨던 **'{keyword}'** 완벽 가이드인데요. 놓치기 쉬운 세부 조건부터 신청 절차, 일정까지 하나도 빠짐없이 꼼꼼하게 챙겨드릴 테니 끝까지 집중해 주세요! 🚀"
        sub_title_1 = f"1. 꼭 알아야 하는 이유! '{keyword}' 핵심 개요와 주요 변경사항 📋"
        sub_title_2 = f"2. 한눈에 보는 비교 분석 도표 & 필수 체크리스트 📊"
        sub_title_3 = f"3. 실패 없이 100% 혜택 챙기는 실전 꿀팁 & 전문가 조언 💡"
    else:
        intro_greeting = f"이웃님들, 반가워요! 💖 요즘 커뮤니티와 SNS에서 '내돈내산' 후기와 함께 가장 핫하게 언급되는 **'{keyword}'** 솔직 리뷰를 들고 왔어요! ✨ 실제 구매나 선택을 고민 중이신 분들을 위해 장점부터 숨겨진 단점, 가성비 비교까지 가감 없이 솔직 담백하게 파헤쳐 드립니다! 🛍️"
        sub_title_1 = f"1. 화제의 중심! '{keyword}' 스펙과 실제 관심 배경 🔍"
        sub_title_2 = f"2. 경쟁 모델/유사 옵션과의 정밀 비교 분석 표 📊"
        sub_title_3 = f"3. 후회 없는 선택을 위한 최종 구매 가이드 & 총평 💡"

    # ==========================================
    # [Step 2] 3대 관점 교차 분석 상세 도표
    # ==========================================
    perspective_table = f"""| 분석 관점 | 실제 보도 팩트 및 핵심 쟁점 | 대중 반응 및 공식 입장 |
| :--- | :--- | :--- |
| **관점 A (현안 중심)** | {fact_sentence_1[:48]}... | 신속한 사건 타임라인 파악 및 실시간 검색량 폭증 |
| **관점 B (파급 효과)** | {fact_sentence_2[:48]}... | 공식 해명 및 향후 대응 방침 발표에 이목 집중 |
| **관점 C (심층 분석)** | {fact_sentence_3[:48]}... | 법적·제도적 파급력 및 향후 시장 영향 분석 |"""

    # ==========================================
    # [Step 3] 제목 3선 및 1,500자 이상 고밀도 본문
    # ==========================================
    title_options = [
        f"[총정리] {keyword} 실제 보도 팩트와 놓치면 안 될 3가지 핵심 포인트!",
        f"요즘 난리 난 '{keyword}' 도대체 무슨 일일까? 3분 만에 완벽 이해하기 ✨",
        f"{keyword} 완벽 가이드! 사건 배경부터 3대 관점 교차 분석, 향후 전망까지 💡"
    ]

    import urllib.parse
    enc_kwd = urllib.parse.quote(keyword)
    source_link_a = f"https://search.naver.com/search.naver?where=news&query={enc_kwd}"
    source_link_b = f"https://search.daum.net/search?w=news&q={enc_kwd}"
    source_link_c = f"https://news.google.com/search?q={enc_kwd}&hl=ko&gl=KR&ceid=KR:ko"

    blog_post_markdown = f"""### [블로그 제목 추천]
1. **{title_options[0]}** (🔥 3사 보도 종합 팩트 중심형)
2. **{title_options[1]}** (💡 궁금증과 호기심 유발형)
3. **{title_options[2]}** (🎯 체류시간을 극대화하는 고밀도 신규 기사형)

---

### [본문 원고]

#### 📌 바쁜 분들을 위한 3초 핵심 포인트 요약
- **핵심 포인트 1 (사건 발단)**: {fact_sentence_1}
- **핵심 포인트 2 (입장 및 쟁점)**: {fact_sentence_2}
- **핵심 포인트 3 (전망 및 영향)**: {fact_sentence_3}

---

#### {sub_title_1}
{intro_greeting}

{today_str} 기준, 여러 포털과 공신력 있는 언론 보도를 통해 **'{keyword}'**에 관한 상세 내용이 집중적으로 다뤄지고 있습니다.

단편적인 소문만 접하고 지나치기에는 실질적인 파급력과 정보의 무게감이 결코 가볍지 않은데요. 공신력 있는 보도 자료와 현장 취재 내용을 종합하면 사안의 발생 배경은 다음과 같은 흐름을 보이고 있습니다.

> 📌 **주요 보도 핵심 인용**:
> {real_quote}

사건의 발단부터 지금까지 이어진 상황을 살펴보면, 초기 보도를 기점으로 대중의 관심이 집중되었고, 이후 관계자들의 공식 입장 발표와 추가 팩트 확인이 이어지며 논의가 한층 구체화되었습니다. 

지금처럼 정보가 빠르게 유통되는 환경에서는 단편적인 루머에 흔들리기보다는, 객관적으로 검증된 타임라인과 사실 관계를 명확히 짚어보는 것이 무엇보다 중요합니다.

<!-- [광고 삽입 포인트 1: 제목 아래 1단락 후] -->

---

#### {sub_title_2}
그렇다면 각 언론사와 분야별 전문가들은 이번 **'{keyword}'** 이슈를 어떤 시각에서 바라보고 있을까요? 

단 하나의 시선에 치우치지 않고 객관적인 판단을 내리실 수 있도록, 3대 핵심 관점(현안 중심, 파급 효과, 심층 분석)을 대조한 비교 분석 표를 정리해 보았습니다.

{perspective_table}

위 표에서 확인하실 수 있듯이, 이번 사안은 단순히 일회성 해프닝으로 끝나지 않고 향후 제도적 보완이나 관련 업계의 패러다임 변화로 이어질 가능성이 높습니다. 

특히 팩트와 이해관계자의 입장을 균형 있게 대조해 보면 우리가 앞으로 어떤 부분에 주목해야 할지 그 방향성이 한눈에 들어오실 거예요.

<!-- [광고 삽입 포인트 2: 상세 비교표 아래 본문 중반] -->

---

#### {sub_title_3}
이번 사안이 앞으로 가져올 파급력과 우리가 실생활에서 반드시 기억해야 할 실전 체크포인트는 다음과 같습니다:

1. **공식 채널을 통한 팩트 더블 체크**: SNS나 메신저를 통해 유포되는 왜곡된 정보 대신, 공식 보도 자료와 공신력 있는 기관의 발표를 기준으로 삼으세요.
2. **후속 일정 및 추가 브리핑 모니터링**: 오늘 공개된 내용 외에도 향후 추가적인 입장 표명이나 정책 발표 일정이 잡혀 있으므로 흐름을 주기적으로 챙겨보는 것이 유리합니다.
3. **나에게 미칠 직간접적 영향 점검**: 개인의 일상, 재테크, 비즈니스 영역에서 직접적인 연관성이 있는지 꼼꼼하게 따져보고 미리 대응책을 마련해 두는 지혜가 필요합니다.

전문가들 역시 이번 이슈를 계기로 관련 분야의 투명성이 한 단계 성숙해질 것으로 전망하고 있는 만큼, 장기적인 관점에서 사안의 진행 추이를 지켜볼 가치가 충분합니다.

<!-- [광고 삽입 포인트 3: 에디터 코멘트 직전 하단] -->

---

#### 💡 에디터의 한 줄 코멘트 & 마무리
> "빠르게 흘러가는 수많은 뉴스 속에서도, 팩트의 본질을 꿰뚫어 보는 안목이 가장 든든한 무기입니다."

오늘 정성껏 정리해 드린 **'{keyword}'** 소식이 이웃님들의 궁금증을 시원하게 해결해 드렸기를 바랍니다! 💖 
유익하셨다면 **공감(❤️) 꾹 눌러주시고, 이웃 추가(이웃 맺기)** 하셔서 매일 업데이트되는 가장 빠르고 정확한 트렌드 정보를 놓치지 마세요! 

이 사안에 대한 이웃님들의 생각이나 더 궁금하신 점은 댓글로 편하게 남겨주시면 정성껏 답글 달아드릴게요! 다음에도 알찬 포스팅으로 찾아뵙겠습니다. 감사합니다! ✨

---

#### 🔗 3대 언론사 참고 보도 및 팩트 출처 (Fact Sources)
- 📌 **언론사 A (사건 보도/현안)**: [네이버 뉴스 실시간 속보 기사 바로가기]({source_link_a})
- 📌 **언론사 B (당사자/공식 입장)**: [다음 뉴스 공식 보도 기사 바로가기]({source_link_b})
- 📌 **언론사 C (전문가/파급 효과)**: [구글 뉴스 심층 분석 기사 바로가기]({source_link_c})

---

#### 🏷️ 추천 태그 (복사해서 사용)
`#{keyword.replace(' ', '')}` `#{keyword.replace(' ', '')}총정리` `#{keyword.replace(' ', '')}팩트체크` `#{keyword.replace(' ', '')}이슈` `#실시간트렌드` `#오늘의뉴스` `#정보공유` `#트렌드분석` `#블로그수익화` `#일상꿀팁`
"""

    blog_post_html = markdown_to_html(blog_post_markdown)

    # ==========================================
    # [Step 4] 세로형(9:16) 쇼츠/릴스 연동 4컷 삽화 프롬프트
    # ==========================================
    art_style_en = "Modern clean 3D isometric and cinematic vector illustration, 9:16 vertical aspect ratio, ultra-high quality, vibrant ambient lighting, sleek design, trendy aesthetic"
    art_style_ko = "세련된 3D 아이소메트릭 & 시네마틱 벡터 일러스트, 9:16 세로 비율, 선명한 앰비언트 조명, 트렌디한 감성"

    shorts_storyboard = [
        {
            "cut": 1,
            "time": "0~2초 (시각적 훅 & 긴급 뉴스 속보)",
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
        "reading_time": "3분 30초",
        "core_intent": "구글/네이버 SEO 상위 노출 및 체류시간 극대화, 3대 광고 배치 최적화",
        "title_options": title_options,
        "blog_post_markdown": blog_post_markdown,
        "blog_post_html": blog_post_html,
        "shorts_storyboard": shorts_storyboard,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

def generate_gemini_content(keyword, detail="", portal_source="포털 통합", article_text="", api_key=None, model_name="gemini-2.0-flash"):
    """
    Google AI Studio Gemini 최신 SDK (google-genai) 및 REST API를 호출하여 실시간 고밀도 원고 생성
    ai_studio_code.py 모듈을 핵심 생성 엔진으로 연동합니다.
    """
    try:
        from ai_studio_code import generate_article
        return generate_article(
            keyword=keyword,
            facts=article_text or detail,
            portal_source=portal_source,
            api_key=api_key,
            model_name=model_name,
            return_dict=True
        )
    except Exception as e:
        print(f"ai_studio_code 연동 호출 실패, 내장 템플릿 엔진으로 폴백: {e}")
        return generate_ai_content(keyword, detail, portal_source, article_text)


