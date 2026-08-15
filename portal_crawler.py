import requests
from bs4 import BeautifulSoup
import json
import re
import time
import random
import sys
from datetime import datetime
import pandas as pd

# 윈도우 콘솔 한글 깨짐 방지
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    # reconfigure가 없는 환경을 대비한 예외 처리
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

# 공통 HTTP 요청 헤더 (차단 우회용)
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com'
}

def random_delay():
    """서버 부하 방지 및 차단 우회를 위한 0초 ~ 1.5초 무작위 딜레이 적용"""
    delay = random.uniform(0, 1.5)
    # print(f"[시스템] 요청 우회 지연 적용 중... ({delay:.2f}초)")
    time.sleep(delay)

def extract_json_by_braces(text, start_pattern):
    """
    텍스트 내에서 특정 패턴으로 시작하는 부분부터 균형 괄호({})를 이용해
    완전한 JSON 객체 문자열을 잘라내어 딕셔너리로 반환합니다.
    """
    start_idx = text.find(start_pattern)
    if start_idx == -1:
        return None
        
    brace_count = 0
    end_idx = -1
    # 균형 괄호 추적 시작
    for idx in range(start_idx, len(text)):
        char = text[idx]
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = idx + 1
                break
                
    if end_idx != -1:
        json_candidate = text[start_idx:end_idx]
        try:
            return json.loads(json_candidate)
        except json.JSONDecodeError:
            return None
    return None

def crawl_nate():
    """
    네이트(Nate) 실시간 이슈 키워드 수집 (1위 ~ 5위)
    """
    url = "https://www.nate.com"
    results = []
    
    try:
        random_delay()
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        soup = BeautifulSoup(response.text, 'html.parser')
        ul_element = soup.select_one('#olLiveIssueKeyword')
        
        if ul_element:
            li_elements = ul_element.select('li')
            for li in li_elements:
                rank_el = li.select_one('.num_rank')
                txt_el = li.select_one('.txt_rank')
                
                # 변동 지표 파싱 (상승/하락/동일/신규)
                state_el = li.select_one('.fc')
                state = "동일"
                if state_el:
                    state_text = state_el.text.strip()
                    # '상승2' 등 숫자 제거 후 한글 변동 상태만 추출
                    clean_state = re.sub(r'[0-9]', '', state_text)
                    if clean_state:
                        state = clean_state
                
                if rank_el and txt_el:
                    rank = int(rank_el.text.strip())
                    keyword = txt_el.text.strip()
                    results.append({
                        'Site': 'Nate',
                        'Rank': rank,
                        'Keyword': keyword,
                        'Detail': state
                    })
        else:
            print("[경고] 네이트 실시간 이슈 키워드 HTML 요소를 찾을 수 없습니다. (선택자 변경 의심)")
            
    except requests.RequestException as e:
        print(f"[에러] 네이트 네트워크 요청 중 오류 발생: {e}")
    except Exception as e:
        print(f"[에러] 네이트 데이터 파싱 중 오류 발생: {e}")
        
    return results

def crawl_zum():
    """
    줌(Zum) 실시간 이슈 검색어 및 연관 주식 종목 데이터 추출
    """
    url = "https://zum.com"
    keyword_results = []
    stock_results = []
    
    try:
        random_delay()
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        soup = BeautifulSoup(response.text, 'html.parser')
        scripts = soup.find_all('script')
        
        # 1. 실시간 이슈 검색어 파싱 (issueWords)
        issue_words_parsed = False
        for script in scripts:
            content = script.string
            if content and "issueWords" in content:
                # Next.js의 데이터 직렬화 이스케이프 문자 제거
                unescaped = content.replace('\\"', '"').replace('\\\\', '\\')
                
                # {"issueWords": ... } 형태를 지닌 객체 추출
                data = extract_json_by_braces(unescaped, '{"issueWords":')
                if not data and '"issueWords":' in unescaped:
                    # 중괄호 누락 대비 보정 후 재추출
                    start_pos = unescaped.find('"issueWords":')
                    data = extract_json_by_braces("{" + unescaped[start_pos:], '{"issueWords":')
                    
                if data and "issueWords" in data:
                    temp_results = []
                    for item in data["issueWords"]:
                        rank = int(item.get("rank", 0))
                        keyword = item.get("keyword", "").strip()
                        desc = item.get("data", "").strip()
                        if rank and keyword:
                            temp_results.append({
                                'Site': 'Zum_Keyword',
                                'Rank': rank,
                                'Keyword': keyword,
                                'Detail': desc if desc else "이슈 정보"
                            })
                    if temp_results:
                        keyword_results = temp_results
                        issue_words_parsed = True
                        break
                    
        if not issue_words_parsed:
            print("[경고] 줌 실시간 이슈 키워드 스크립트 데이터를 찾을 수 없습니다.")

        # 2. 연관 주식 종목(지금 뜨는 주식) 파싱
        stock_parsed = False
        for script in scripts:
            content = script.string
            if content and "invest_domestic" in content:
                unescaped = content.replace('\\"', '"').replace('\\\\', '\\')
                
                data = extract_json_by_braces(unescaped, '{"initialData"')
                if not data and '"initialData"' in unescaped:
                    start_pos = unescaped.find('"initialData"')
                    data = extract_json_by_braces("{" + unescaped[start_pos:], '{"initialData"')
                    
                if data and "initialData" in data:
                    invest_domestic = data["initialData"].get("invest_domestic", {})
                    stock_list = invest_domestic.get("stock", [])
                    
                    temp_stocks = []
                    rank_counter = 1
                    for cat_data in stock_list:
                        category = cat_data.get("category")
                        # 'popularTrendingMix'가 메인의 '지금 뜨는 주식' 데이터임
                        if category == "popularTrendingMix":
                            items_groups = cat_data.get("items", [])
                            for group in items_groups:
                                for stock_item in group:
                                    name = stock_item.get("entityName", "").strip()
                                    symbol = stock_item.get("symbol", "").strip()
                                    close_price = stock_item.get("close", 0)
                                    change_percent = stock_item.get("changePercent", 0.0)
                                    
                                    if name:
                                        temp_stocks.append({
                                            'Site': 'Zum_Stock',
                                            'Rank': rank_counter,
                                            'Keyword': name,
                                            'Detail': f"코드: {symbol} | 현재가: {close_price:,}원 | 변동률: {change_percent:+.2f}%"
                                        })
                                        rank_counter += 1
                            if temp_stocks:
                                stock_results = temp_stocks
                                stock_parsed = True
                                break
            if stock_parsed:
                break
                
        if not stock_parsed:
            print("[경고] 줌 인기 주식 종목 스크립트 데이터를 찾을 수 없습니다.")
            
    except requests.RequestException as e:
        print(f"[에러] 줌 네트워크 요청 중 오류 발생: {e}")
    except json.JSONDecodeError as e:
        print(f"[에러] 줌 JSON 데이터 디코딩 중 오류 발생: {e}")
    except Exception as e:
        print(f"[에러] 줌 데이터 파싱 중 오류 발생: {e}")
        
    return keyword_results, stock_results

def crawl_daum():
    """
    다음(Daum) 실시간 트렌드 키워드 수집 (1위 ~ 10위)
    """
    # PC 메인에 비해 모바일 메인이 실시간 트렌드 정보를 안정적으로 노출하고 있어 모바일을 타겟팅함
    url = "https://m.daum.net"
    results = []
    
    try:
        random_delay()
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 모바일 다음의 실시간 트렌드 리스트를 가리키는 클래스
        trend_list = soup.select_one('.list_trendrank')
        
        if trend_list:
            li_elements = trend_list.select('li')
            for li in li_elements:
                link_item = li.select_one('a.link_item')
                if link_item:
                    # 텍스트 형태 예시: "\n1위,\n여한구 직권면직\n,동일"
                    # 개행과 공백을 깨끗하게 정리함
                    raw_text = link_item.text.strip()
                    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
                    
                    # lines 가 정상적으로 구분되었을 때
                    # 예시: ['1위,', '여한구 직권면직', ',동일']
                    if len(lines) >= 3:
                        rank_str = lines[0].replace('위,', '').strip()
                        keyword = lines[1].strip()
                        state = lines[2].replace(',', '').strip()
                        
                        try:
                            rank = int(rank_str)
                        except ValueError:
                            # 1위, 등의 특수문자가 안 잘렸을 경우 숫자만 추출
                            rank_match = re.search(r'\d+', rank_str)
                            rank = int(rank_match.group(0)) if rank_match else 0
                            
                        results.append({
                            'Site': 'Daum',
                            'Rank': rank,
                            'Keyword': keyword,
                            'Detail': state
                        })
                    else:
                        # 구분선 포맷이 달라졌을 경우 단순 문자 파싱 시도
                        # 쉼표 구분 시도
                        text_parts = [p.strip() for p in raw_text.split(',') if p.strip()]
                        if len(text_parts) >= 2:
                            # 예: ["1위", "여한구 직권면직", "동일"]
                            rank_part = text_parts[0]
                            rank_match = re.search(r'\d+', rank_part)
                            rank = int(rank_match.group(0)) if rank_match else 0
                            
                            keyword = text_parts[1]
                            state = text_parts[2] if len(text_parts) > 2 else "동일"
                            results.append({
                                'Site': 'Daum',
                                'Rank': rank,
                                'Keyword': keyword,
                                'Detail': state
                            })
        else:
            print("[경고] 다음 실시간 트렌드 HTML 요소를 찾을 수 없습니다. (선택자 변경 의심)")
            
    except requests.RequestException as e:
        print(f"[에러] 다음 네트워크 요청 중 오류 발생: {e}")
    except Exception as e:
        print(f"[에러] 다음 데이터 파싱 중 오류 발생: {e}")
        
    return results

def print_korean_aligned(text, length=30):
    """한글과 영문/숫자의 바이트 수 차이를 계산하여 터미널 정렬을 보정해주는 함수"""
    count = 0
    for char in text:
        # 한글 음절 범위 판단
        if '\uac00' <= char <= '\ud7a3':
            count += 2
        else:
            count += 1
    # 보정된 패딩 크기 계산
    padding = max(0, length - count)
    return text + " " * padding

def main():
    print("=" * 60)
    print("   [포털 실시간 트렌드 및 주식 정보 수집기 프로그램]")
    print(f"   실행 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 1. 네이트 수집
    print("\n📡 네이트(Nate) 실시간 이슈 키워드 수집 중...")
    nate_data = crawl_nate()
    
    # 2. 줌 수집
    print("📡 줌(Zum) 실시간 검색어 및 주식 정보 수집 중...")
    zum_keywords, zum_stocks = crawl_zum()
    
    # 3. 다음 수집
    print("📡 다음(Daum) 실시간 트렌드 키워드 수집 중...")
    daum_data = crawl_daum()
    
    # 4. 터미널 출력 가시화
    print("\n" + "=" * 60)
    print("                      [ 실시간 수집 결과 ]")
    print("=" * 60)
    
    # 네이트 출력
    print("\n🔹 [네이트] 실시간 이슈 키워드 (Top 5)")
    print("-" * 50)
    for item in nate_data:
        kwd = print_korean_aligned(item['Keyword'], 25)
        print(f" {item['Rank']:2d}. {kwd} | 상태: {item['Detail']}")
        
    # 다음 출력
    print("\n🔹 [다음] 실시간 트렌드 키워드 (Top 10)")
    print("-" * 50)
    for item in daum_data:
        kwd = print_korean_aligned(item['Keyword'], 25)
        print(f" {item['Rank']:2d}. {kwd} | 변동: {item['Detail']}")
        
    # 줌 키워드 출력
    print("\n🔹 [줌] AI 실시간 이슈 검색어 (Top 10)")
    print("-" * 50)
    for item in zum_keywords:
        kwd = print_korean_aligned(item['Keyword'], 25)
        print(f" {item['Rank']:2d}. {kwd} | 요약: {item['Detail']}")
        
    # 줌 인기 주식 출력
    print("\n🔹 [줌] 지금 뜨는 인기 주식 종목 (Top 25)")
    print("-" * 65)
    for item in zum_stocks:
        kwd = print_korean_aligned(item['Keyword'], 18)
        print(f" {item['Rank']:2d}. {kwd} | {item['Detail']}")
        
    # 5. 데이터 통합 및 CSV 저장
    all_data = nate_data + daum_data + zum_keywords + zum_stocks
    
    if all_data:
        df = pd.DataFrame(all_data)
        
        # 타임스탬프 컬럼을 맨 앞으로 삽입
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        df.insert(0, 'Timestamp', current_time)
        
        csv_file = "realtime_trends.csv"
        
        try:
            # 기존 파일이 있으면 데이터 누적(append), 없으면 새로 쓰기
            try:
                existing_df = pd.read_csv(csv_file, encoding='utf-8-sig')
                updated_df = pd.concat([existing_df, df], ignore_index=True)
                updated_df.to_csv(csv_file, index=False, encoding='utf-8-sig')
                print(f"\n[성공] 기존 {csv_file} 파일에 수집 데이터를 누적하여 업데이트했습니다. ✅")
            except FileNotFoundError:
                df.to_csv(csv_file, index=False, encoding='utf-8-sig')
                print(f"\n[성공] 수집 완료! 새 {csv_file} 파일을 생성하고 저장했습니다. ✅")
                
        except Exception as e:
            print(f"\n[에러] CSV 파일 저장 중 오류 발생: {e}")
    else:
        print("\n[경고] 수집된 데이터가 없어 CSV 파일을 저장하지 않았습니다.")
        
    print("\n" + "=" * 60)
    print("   모니터링 프로그램 동작 완료.")
    print("=" * 60)

if __name__ == '__main__':
    main()
