# -*- coding: utf-8 -*-
"""
Google AI Studio System Instructions 기반 블로그 수익화 & SEO 마스터 에이전트
- 모델: gemini-flash-latest (Google AI Studio 최신 공식 모델)
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

def generate_article(keyword="BTS", facts="", portal_source="포털 통합", api_key=None, model_name="gemini-flash-latest", return_dict=False):
    """
    Google AI Studio Gemini 최신 SDK(google-genai) 또는 REST API v1beta를 통해 실시간 기사 작성
    
    Parameters:
        keyword (str): 핵심 키워드
        facts (str): 실시간 기사 팩트 또는 상세 정보
        portal_source (str): 포털 출처 명칭
        api_key (str): Gemini API 키 (미지정 시 GEMINI_API_KEY 환경변수 사용)
        model_name (str): 사용할 Gemini 모델명 (기본: gemini-flash-latest)
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
1. 위 실시간 수집된 뉴스 보도 및 유튜브 영상 팩트를 정밀 분석하여 작성해 주세요.
2. 만약 뉴스 기사의 정보가 짧거나 정확도가 떨어지는 경우, 함께 수집된 [유튜브 영상 자막/설명 팩트]를 최우선으로 심층 분석하여 원고의 깊이와 체류시간을 극대화해 주세요.
3. [매우 중요] 기사 본문 하단의 [🎥 참고 보도 및 팩트 출처 (Fact Sources)] 섹션에는 가상의 문구 대신, 위에 제공된 실제 [기사/영상 제목], [링크 URL], [매체/채널명]을 그대로 사용하여 다음과 같이 정확한 마크다운 클릭 링크로 작성해 주세요:
   - 📌 **출처 1**: [실제 기사/영상 제목 1](실제 링크 URL 1) (실제 매체/채널명 1)
   - 📌 **출처 2**: [실제 기사/영상 제목 2](실제 링크 URL 2) (실제 매체/채널명 2)
   - 📌 **출처 3**: [실제 기사/영상 제목 3](실제 링크 URL 3) (실제 매체/채널명 3)
4. System Instructions에 정의된 [{k_type_name}] 레이아웃 규칙에 따라 [블로그 제목 추천] 3가지와 [본문 원고] (1,500~2,000자 이상 고품질 파워블로거 완성 기사 + 3대 광고 삽입 포인트 + 3대 관점 비교표 + 에디터 코멘트 + 참고 보도 출처 + 추천 태그) 및 [쇼츠 4컷 스토리보드 9:16]를 완벽하게 작성해 주세요."""

    current_sys_instruction = load_system_instruction()
    generated_text = ""
    target_models = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
    used_model = model_name or 'gemini-flash-lite-latest'

    # 1. API 키가 제공된 경우: 최신 공식 google-genai SDK 호출 시도
    if key:
        for cur_model in target_models:
            try:
                # pyrefly: ignore [missing-import]
                from google import genai
                client = genai.Client(api_key=key)
                
                response = client.models.generate_content(
                    model=cur_model,
                    contents=prompt_text,
                    config={
                        'system_instruction': current_sys_instruction,
                        'temperature': 1.0,
                        'max_output_tokens': 65536,
                        'top_p': 0.95,
                    }
                )
                generated_text = response.text or ""
                if generated_text:
                    used_model = cur_model
                    if not return_dict:
                        print("\n" + "=" * 60)
                        print(f"🚀 Google AI Studio (Gemini SDK - {cur_model}) 기사 작성 완료 [{k_type_name}]: '{keyword}'")
                        print("=" * 60 + "\n")
                        print(generated_text)
                    break
            except Exception as sdk_err:
                pass

    # 2. REST API v1beta 직접 호출 (SDK 미설치 또는 SDK 실패 시)
    if not generated_text and key:
        for cur_model in target_models:
            try:
                import requests
                endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{cur_model}:generateContent"
                
                payload = {
                    "system_instruction": {"parts": [{"text": current_sys_instruction}]},
                    "contents": [{"role": "user", "parts": [{"text": prompt_text}]}],
                    "generationConfig": {
                        "temperature": 1.0,
                        "maxOutputTokens": 65536
                    }
                }
                headers = {
                    "Content-Type": "application/json",
                    "X-goog-api-key": key
                }
                resp = requests.post(endpoint, headers=headers, json=payload, timeout=25)
                if resp.status_code == 200:
                    data = resp.json()
                    generated_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if generated_text:
                        used_model = cur_model
                        break
            except Exception as rest_err:
                pass

    # 3. 키가 없거나 API 호출 실패 시: 임시 기사를 쓰지 않고 빈 값 반환
    if not generated_text:
        if return_dict:
            return {
                "keyword": keyword,
                "keyword_type": k_type,
                "keyword_type_name": "❌ 기사 작성 실패 (API 키 확인 필요)",
                "reading_time": "0초",
                "core_intent": "API 연동 오류",
                "title_options": [],
                "blog_post_markdown": "",
                "blog_post_html": "<div style='text-align:center; padding: 3rem; color: #dc2626;'><h3>⚠️ API 연동 오류로 인해 기사를 작성할 수 없습니다.</h3><p>Google AI Studio API Key를 확인해 주세요.</p></div>",
                "shorts_storyboard": [],
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        return ""

    # 웹/API 호출용 딕셔너리 반환 요청 시 포맷팅
    if return_dict:
        parsed_shorts = parse_shorts_from_markdown(generated_text)

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

        return {
            "keyword": keyword,
            "keyword_type": k_type,
            "keyword_type_name": f"🚀 Gemini ({used_model}) - {k_type_name}",
            "reading_time": "3분 30초",
            "core_intent": f"Google AI Studio Gemini ({used_model}) 실시간 AI 창작 원고 ({k_type_name})",
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
