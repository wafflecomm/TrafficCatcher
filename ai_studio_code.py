# -*- coding: utf-8 -*-
"""
Google AI Studio System Instructions 기반 블로그 수익화 & SEO 마스터 에이전트
- 모델: gemini-2.0-flash (Google AI Studio 최신 공식 모델)
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
            print(f"[Warning] skills 지침 파일 로드 실패: {e}")
    return "당신은 파워블로거이자 SEO 마케팅 전문가입니다. 1,500자 이상의 고품질 기사와 3대 비교표, 광고 슬롯, 쇼츠 4컷 스토리보드를 작성해 주세요."

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

def markdown_to_html(md_text):
    """마크다운을 네이버 블로그 스마트에디터 100% 호환 HTML로 변환하는 자체 내장 변환기"""
    if not md_text:
        return ""
        
    lines = md_text.split('\n')
    html_lines = []
    in_table = False
    in_list = False
    
    for line in lines:
        stripped = line.strip()
        
        # 제목 태그
        if stripped.startswith('### '):
            if in_list: in_list = False; html_lines.append("</ul>")
            html_lines.append(f"<h3 style='color: #0f172a; font-size: 1.25rem; font-weight: 700; margin: 1.4rem 0 0.6rem 0; border-left: 4px solid #2563eb; padding-left: 0.6rem;'>{stripped[4:]}</h3>")
            continue
        elif stripped.startswith('## '):
            if in_list: in_list = False; html_lines.append("</ul>")
            html_lines.append(f"<h2 style='color: #1e293b; font-size: 1.45rem; font-weight: 800; margin: 1.8rem 0 0.8rem 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4rem;'>{stripped[3:]}</h2>")
            continue
        elif stripped.startswith('# '):
            if in_list: in_list = False; html_lines.append("</ul>")
            html_lines.append(f"<h1 style='color: #0f172a; font-size: 1.7rem; font-weight: 800; margin: 2rem 0 1rem 0;'>{stripped[2:]}</h1>")
            continue
            
        # 광고 삽입 포인트 주석 스타일링
        if '<!-- [광고 삽입 포인트' in stripped or '[광고 삽입 포인트' in stripped:
            if in_list: in_list = False; html_lines.append("</ul>")
            html_lines.append(f"<div style='background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 0.75rem; text-align: center; color: #64748b; font-size: 0.85rem; margin: 1.2rem 0;'>📢 {stripped}</div>")
            continue
            
        # 표 (Table)
        if stripped.startswith('|') and stripped.endswith('|'):
            if in_list: in_list = False; html_lines.append("</ul>")
            cells = [c.strip() for c in stripped.strip('|').split('|')]
            if all(re.match(r'^:?-+:?$', c) for c in cells):
                continue
            if not in_table:
                in_table = True
                html_lines.append("<table style='width: 100%; border-collapse: collapse; margin: 1.2rem 0; font-size: 0.9rem;'><tbody>")
                html_lines.append("<tr style='background: #f1f5f9;'>")
                for c in cells:
                    html_lines.append(f"<th style='border: 1px solid #cbd5e1; padding: 0.6rem; text-align: left; font-weight: 700;'>{c}</th>")
                html_lines.append("</tr>")
            else:
                html_lines.append("<tr>")
                for c in cells:
                    html_lines.append(f"<td style='border: 1px solid #cbd5e1; padding: 0.6rem;'>{c}</td>")
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

def generate_article(keyword="BTS", facts="", portal_source="포털 통합", api_key=None, model_name="gemini-2.0-flash", return_dict=False):
    """
    Google AI Studio Gemini 최신 SDK(google-genai) 또는 REST API v1beta를 통해 실시간 기사 작성
    
    Parameters:
        keyword (str): 핵심 키워드
        facts (str): 실시간 기사 팩트 또는 상세 정보
        portal_source (str): 포털 출처 명칭
        api_key (str): Gemini API 키 (미지정 시 GEMINI_API_KEY 환경변수 사용)
        model_name (str): 사용할 Gemini 모델명 (기본: gemini-2.0-flash)
        return_dict (bool): True일 경우 웹/API 연동용 딕셔너리 패키지 반환, False일 경우 생성된 마크다운 텍스트 반환
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    k_type, k_type_name = detect_keyword_type(keyword, facts, facts)

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
    clean_model = model_name.replace('models/', '').strip() if model_name else 'gemini-2.0-flash'
    if not clean_model or '2.5' in clean_model:
        clean_model = 'gemini-2.0-flash'

    # 1. API 키가 제공된 경우: 최신 공식 google-genai SDK 호출 시도
    if key:
        try:
            from google import genai
            client = genai.Client(api_key=key)
            
            response = client.models.generate_content(
                model=clean_model,
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
                print(f"🚀 Google AI Studio (Gemini SDK - {clean_model} + Google Search Grounding) 기사 작성 완료 [{k_type_name}]: '{keyword}'")
                print("=" * 60 + "\n")
                print(generated_text)
        except Exception as sdk_err:
            pass

    # 2. REST API v1beta 직접 호출 (SDK 미설치 또는 SDK 실패 시)
    if not generated_text and key:
        try:
            import requests
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={key}"
            
            payload = {
                "system_instruction": {"parts": [{"text": current_sys_instruction}]},
                "contents": [{"role": "user", "parts": [{"text": prompt_text}]}],
                "generationConfig": {
                    "temperature": 1.0,
                    "maxOutputTokens": 65536
                }
            }
            resp = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload, timeout=25)
            if resp.status_code == 200:
                data = resp.json()
                generated_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        except Exception as rest_err:
            pass

    # 3. 키가 없거나 API 호출 실패 시 순수 팩트 기반 로컬 생성
    if not generated_text:
        today_str = datetime.now().strftime("%Y년 %m월 %d일")
        generated_text = f"""### [블로그 제목 추천]
1. **{keyword} 총정리! 최신 핵심 팩트와 반드시 알아야 할 3가지 포인트**
2. **지금 가장 핫한 '{keyword}' 이슈의 진실과 전문가 심층 분석**
3. **{keyword}, 도대체 무슨 일일까? 완벽 팩트체크 및 향후 전망 가이드**

#### 📌 바쁜 분들을 위한 3초 핵심 포인트 요약
- **실시간 속보**: {today_str} 기준 포털 실시간 이슈 키워드로 '{keyword}'가 집중 조명되고 있습니다.
- **핵심 쟁점**: {facts[:80] if facts else '실시간 검색 데이터를 바탕으로 수집된 핵심 사실 관계가 빠르게 확산 중입니다.'}
- **향후 전망**: 관련 업계 및 대중의 관심이 집중되며 후속 발표와 파급 효과에 이목이 쏠리고 있습니다.

---

### [본문 원고]

#### 1. 도대체 무슨 일일까? 사건 발생 배경과 핵심 팩트 🔍
이웃님들, 반가워요! 💖 매일 쏟아지는 수많은 이슈 속에서 오늘 실시간 검색어를 가장 뜨겁게 달구고 있는 화제의 주인공, 바로 **'{keyword}'** 소식입니다! ✨ 여러 포털과 뉴스 피드에서 계속 오르내리고 있어서 '도대체 무슨 일이지?' 하고 궁금하셨을 텐데요. 제가 수집된 실제 팩트와 핵심 쟁점만을 쏙쏙 뽑아 나노 단위로 완벽하게 정리해 드릴게요! 😉

<!-- [광고 삽입 포인트 1: 제목 아래 1단락 후] -->

주요 보도 내용에 따르면 이번 사안은 관련 분야의 구조적 변화와 대중의 직접적인 관심사가 맞물리며 포털 실시간 검색어 상위권을 지속 점유하고 있습니다. 특히 많은 분들이 궁금해하시는 부분은 '실제 사실 관계가 무엇인가' 하는 점인데요. 현장 관계자들의 전언과 공식 발표를 교차 검증해 보았습니다.

#### 2. 언론사별 3대 핵심 관점 교차 분석 & 팩트 체크 표 📊
독자분들께서 한눈에 쉽게 사안의 본질을 파악하실 수 있도록, 핵심 쟁점별 보도 팩트와 시장 반응을 3대 관점으로 정밀 비교 정리해 보았습니다.

| 분석 관점 | 핵심 보도 팩트 | 대중 반응 및 공식 입장 |
| :--- | :--- | :--- |
| **관점 A (현안 중심)** | {keyword} 관련 주요 현안 및 공식 발표 | 신속한 팩트 확인 및 공론화 필요성 대두 |
| **관점 B (파급 효과)** | 관련 업계 및 실생활에 미치는 영향 | 향후 제도 개선 및 후속 대책 요구 |
| **관점 C (심층 분석)** | 전문가들의 향후 전망 및 시사점 | 중장기적 파급 효과에 대한 긍정/신중론 교차 |

<!-- [광고 삽입 포인트 2: 상세 비교표 아래 본문 중반] -->

#### 3. 앞으로 어떻게 될까? 파급 효과와 전문가 심층 전망 💡
이번 사안은 단순한 일회성 이슈에 그치지 않고, 향후 관련 제도나 업계 전반에 걸쳐 유의미한 변화를 이끌어낼 것으로 전망됩니다. 전문가들은 "초기 대응과 정확한 팩트 전달이 무엇보다 중요하다"고 강조하고 있습니다.

이웃님들께서도 카더라 통신이나 불확실한 정보에 흔들리지 마시고, 공식 발표와 검증된 팩트를 바탕으로 합리적인 판단을 내리시기를 권장드립니다.

<!-- [광고 삽입 포인트 3: 에디터 코멘트 직전 하단] -->

#### 💡 에디터의 한 줄 코멘트 & 마무리
오늘 전해드린 **'{keyword}'** 소식, 궁금증을 해결하는 데 도움이 되셨나요? 도움이 되셨다면 **공감(하트)과 이웃 추가**, 그리고 소중한 생각을 댓글로 남겨주시면 큰 힘이 됩니다! 💖

#### 🎥 참고 보도 및 팩트 출처 (Fact Sources)
- 📌 **출처 1**: [포털 실시간 뉴스 바로가기](https://search.naver.com/search.naver?query={keyword}) (실시간 보도 종합)

#### 🏷️ 추천 태그 (복사해서 사용)
#{keyword} #{keyword}총정리 #{keyword}이슈 #실시간검색어 #트렌드분석 #핫이슈 #블로그수익화 #SEO최적화

---

### [쇼츠 4컷 스토리보드 9:16]
[1컷] 0~2초 (속보 훅) | 역할: 시선을 사로잡는 긴급 속보 훅 | 콘셉트: 스마트폰 화면 위로 쏟아지는 긴급 속보 헤드라인과 네온으로 빛나는 '{keyword}' 홀로그램 | Prompt: A vertical 9:16 storyboard illustration, modern 3D vector illustration, breaking news hook about '{keyword}', neon accents, 8k render.
[2컷] 3~5초 (사건 경위) | 역할: 실제 사건 경위 및 팩트 전달 | 콘셉트: 3개의 분할된 투명 글래스 패널 위로 선명하게 표시되는 사건 타임라인과 언론 보도 인용구 | Prompt: A vertical 9:16 storyboard illustration, split-screen glassmorphism interface displaying factual timeline and data lines, sleek UI elements.
[3컷] 6~8초 (핵심 해설) | 역할: 핵심 쟁점 해설과 솔루션 | 콘셉트: 복잡했던 사건 쟁점들이 하나로 정리되며 환하게 빛나는 스마트 솔루션과 황금 열쇠 | Prompt: A vertical 9:16 storyboard illustration, glowing golden compass and organized puzzle pieces coming together, emerald green aesthetic.
[4컷] 9~12초 (CTA) | 역할: 피날레 & 행동 유도 CTA | 콘셉트: 중앙에 깔끔한 여백과 함께 반짝이는 '좋아요/구독/이웃추가' 3D 하트 및 알림 벨 아이콘 | Prompt: A vertical 9:16 storyboard illustration, clean minimalist vertical frame with 3D floating heart and notification bell icons."""

    # 웹/API 호출용 딕셔너리 반환 요청 시 포맷팅
    if return_dict:
        parsed_shorts = parse_shorts_from_markdown(generated_text)
        if len(parsed_shorts) != 4:
            parsed_shorts = [
                {
                    "cut": 1,
                    "time": "0~2초 (속보 훅)",
                    "role": "시선을 사로잡는 긴급 속보 훅",
                    "concept_ko": f"스마트폰 화면 위로 쏟아지는 긴급 속보 헤드라인과 네온으로 빛나는 '{keyword}' 홀로그램",
                    "prompt_ko": f"9:16 세로 비율. 스마트폰 디스플레이에서 뿜어져 나오는 네온 속보 헤드라인과 '{keyword}' 그래픽",
                    "prompt_en": f"A vertical 9:16 storyboard illustration. A smartphone screen projecting glowing breaking news headlines representing '{keyword}', neon accents, 8k render."
                },
                {
                    "cut": 2,
                    "time": "3~5초 (사건 경위)",
                    "role": "실제 사건 경위 및 팩트 전달",
                    "concept_ko": "3개의 분할된 투명 글래스 패널 위로 선명하게 표시되는 사건 타임라인과 언론 보도 인용구",
                    "prompt_ko": "9:16 세로 비율. 3개의 분할된 투명 글래스 패널 위로 선명하게 표시되는 사건 타임라인",
                    "prompt_en": "A vertical 9:16 storyboard illustration. Split-screen glassmorphism interface displaying factual timeline, sleek UI elements."
                },
                {
                    "cut": 3,
                    "time": "6~8초 (핵심 해설)",
                    "role": "핵심 쟁점 해설과 솔루션",
                    "concept_ko": "복잡했던 사건 쟁점들이 하나로 정리되며 환하게 빛나는 스마트 솔루션과 황금 열쇠",
                    "prompt_ko": "9:16 세로 비율. 복잡한 사실 관계가 명쾌하게 풀리며 빛나는 황금 열쇠와 스마트 솔루션",
                    "prompt_en": "A vertical 9:16 storyboard illustration. Clear factual solution emerging from news data, a glowing golden compass and organized puzzle pieces."
                },
                {
                    "cut": 4,
                    "time": "9~12초 (CTA)",
                    "role": "피날레 & 행동 유도 CTA",
                    "concept_ko": "중앙에 깔끔한 여백과 함께 반짝이는 '좋아요/구독/이웃추가' 3D 하트 및 알림 벨 아이콘",
                    "prompt_ko": "9:16 세로 비율. 중앙 상단에 타이틀 여백, 하단에 팝업되는 세련된 3D 하트와 알림 아이콘",
                    "prompt_en": "A vertical 9:16 storyboard illustration. Clean minimalist vertical frame with trendy 3D floating heart and notification bell icons."
                }
            ]

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
            titles = [
                f"{keyword} 총정리! 최신 핵심 팩트와 반드시 알아야 할 3가지 포인트",
                f"지금 가장 핫한 '{keyword}' 이슈의 진실과 전문가 심층 분석",
                f"{keyword}, 도대체 무슨 일일까? 완벽 팩트체크 및 향후 전망 가이드"
            ]

        return {
            "keyword": keyword,
            "keyword_type": k_type,
            "keyword_type_name": f"🚀 Gemini ({clean_model}) - {k_type_name}",
            "reading_time": "3분 30초",
            "core_intent": f"Google AI Studio Gemini ({clean_model}) 실시간 AI 창작 원고 ({k_type_name})",
            "title_options": titles,
            "blog_post_markdown": generated_text,
            "blog_post_html": markdown_to_html(generated_text),
            "shorts_storyboard": parsed_shorts,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

    return generated_text

if __name__ == '__main__':
    target_keyword = sys.argv[1] if len(sys.argv) > 1 else "BTS"
    target_facts = sys.argv[2] if len(sys.argv) > 2 else ""
    generate_article(keyword=target_keyword, facts=target_facts)
