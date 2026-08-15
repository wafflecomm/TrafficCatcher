import requests
import threading
from bs4 import BeautifulSoup
import json
import re
import time
import random
import sys
import os
from datetime import datetime, timezone, timedelta
import pandas as pd

# 한국 표준시(KST, UTC+9) 타임존 정의 (GitHub Actions 클라우드 환경 대응)
KST = timezone(timedelta(hours=9))

def get_kst_now_str():
    """클라우드(UTC) 및 로컬 환경 모두에서 일관된 한국 표준시(KST) 타임스탬프 반환"""
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")

# Flask 관련 모듈 가져오기
from flask import Flask, render_template, jsonify, send_from_directory

# 윈도우 콘솔 한글 깨짐 방지
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

# 공통 HTTP 요청 헤더 (차단 우회용)
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com'
}

CSV_FILE = "realtime_trends.csv"

def random_delay():
    """서버 부하 방지 및 차단 우회를 위한 0초 ~ 1.5초 무작위 딜레이 적용"""
    delay = random.uniform(0, 1.5)
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
    """네이트(Nate) 실시간 이슈 키워드 수집 (1위 ~ 5위)"""
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
                
                state_el = li.select_one('.fc')
                state = "동일"
                if state_el:
                    state_text = state_el.text.strip()
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
            print("[경고] 네이트 실시간 이슈 키워드 HTML 요소를 찾을 수 없습니다.")
            
    except requests.RequestException as e:
        print(f"[에러] 네이트 네트워크 요청 중 오류 발생: {e}")
    except Exception as e:
        print(f"[에러] 네이트 데이터 파싱 중 오류 발생: {e}")
        
    return results

def crawl_zum():
    """줌(Zum) 실시간 이슈 검색어 및 연관 주식 종목 데이터 추출"""
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
                unescaped = content.replace('\\"', '"').replace('\\\\', '\\')
                
                data = extract_json_by_braces(unescaped, '{"issueWords":')
                if not data and '"issueWords":' in unescaped:
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
    """다음(Daum) 실시간 트렌드 키워드 수집 (1위 ~ 10위)"""
    url = "https://m.daum.net"
    results = []
    
    try:
        random_delay()
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        soup = BeautifulSoup(response.text, 'html.parser')
        trend_list = soup.select_one('.list_trendrank')
        
        if trend_list:
            li_elements = trend_list.select('li')
            for li in li_elements:
                link_item = li.select_one('a.link_item')
                if link_item:
                    raw_text = link_item.text.strip()
                    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
                    
                    if len(lines) >= 3:
                        rank_str = lines[0].replace('위,', '').strip()
                        keyword = lines[1].strip()
                        state = lines[2].replace(',', '').strip()
                        
                        try:
                            rank = int(rank_str)
                        except ValueError:
                            rank_match = re.search(r'\d+', rank_str)
                            rank = int(rank_match.group(0)) if rank_match else 0
                            
                        results.append({
                            'Site': 'Daum',
                            'Rank': rank,
                            'Keyword': keyword,
                            'Detail': state
                        })
                    else:
                        text_parts = [p.strip() for p in raw_text.split(',') if p.strip()]
                        if len(text_parts) >= 2:
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
            print("[경고] 다음 실시간 트렌드 HTML 요소를 찾을 수 없습니다.")
            
    except requests.RequestException as e:
        print(f"[에러] 다음 네트워크 요청 중 오류 발생: {e}")
    except Exception as e:
        print(f"[에러] 다음 데이터 파싱 중 오류 발생: {e}")
        
    return results

def crawl_signal():
    """시그널(signal.bz) 실시간 인기 검색어(Top 10) 수집 함수"""
    url = "https://api.signal.bz/news/realtime"
    results = []
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://signal.bz/'
    }
    
    try:
        random_delay()
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if 'top10' in data:
            for item in data['top10']:
                rank = int(item.get('rank', 0))
                keyword = item.get('keyword', '').strip()
                state_raw = item.get('state', 'same')
                
                # 변동 지표 텍스트화
                state = "신규" if state_raw == 'n' else "동일"
                
                results.append({
                    'Site': 'Signal',
                    'Rank': rank,
                    'Keyword': keyword,
                    'Detail': state
                })
        else:
            print("[경고] 시그널 실시간 검색어 API에 'top10' 키가 없습니다.")
            
    except requests.RequestException as e:
        print(f"[에러] 시그널 네트워크 요청 중 오류 발생: {e}")
    except Exception as e:
        print(f"[에러] 시그널 데이터 파싱 중 오류 발생: {e}")
        
    return results

def print_korean_aligned(text, length=30):
    """한글과 영문/숫자의 바이트 수 차이를 계산하여 터미널 정렬을 보정해주는 함수"""
    count = 0
    for char in text:
        if '\uac00' <= char <= '\ud7a3':
            count += 2
        else:
            count += 1
    padding = max(0, length - count)
    return text + " " * padding

def run_all_crawlers():
    """모든 크롤러를 실행하고 데이터를 가공해 반환하는 함수"""
    print("\n📡 네이트(Nate) 실시간 이슈 키워드 수집 중...")
    nate_data = crawl_nate()
    
    print("📡 줌(Zum) 실시간 검색어 및 주식 정보 수집 중...")
    zum_keywords, zum_stocks = crawl_zum()
    
    print("📡 다음(Daum) 실시간 트렌드 키워드 수집 중...")
    daum_data = crawl_daum()
    
    print("📡 시그널(Signal) 실시간 검색어 수집 중...")
    signal_data = crawl_signal()
    
    current_time = get_kst_now_str()
    
    # 데이터 통합 (요청 순서 반영: Signal -> Daum -> Nate -> Zum)
    all_data = signal_data + daum_data + nate_data + zum_keywords + zum_stocks
    
    if all_data:
        df = pd.DataFrame(all_data)
        df.insert(0, 'Timestamp', current_time)
        
        try:
            # CSV 파일 누적 저장
            try:
                existing_df = pd.read_csv(CSV_FILE, encoding='utf-8-sig')
                updated_df = pd.concat([existing_df, df], ignore_index=True)
                updated_df.to_csv(CSV_FILE, index=False, encoding='utf-8-sig')
                print(f"[성공] {CSV_FILE}에 데이터를 누적 저장했습니다. ✅")
            except FileNotFoundError:
                df.to_csv(CSV_FILE, index=False, encoding='utf-8-sig')
                print(f"[성공] 새 {CSV_FILE} 파일을 생성하여 저장했습니다. ✅")
        except Exception as e:
            print(f"[에러] CSV 저장 실패: {e}")
            
    # 시그널 전용 독립 CSV 파일 자동 저장 (요구사항 반영)
    if signal_data:
        sig_file = "signal_realtime_keywords.csv"
        sig_df = pd.DataFrame([{
            'Timestamp': current_time,
            'Rank': item['Rank'],
            'Keyword': item['Keyword']
        } for item in signal_data])
        
        try:
            try:
                existing_sig = pd.read_csv(sig_file, encoding='utf-8-sig')
                updated_sig = pd.concat([existing_sig, sig_df], ignore_index=True)
                updated_sig.to_csv(sig_file, index=False, encoding='utf-8-sig')
            except FileNotFoundError:
                sig_df.to_csv(sig_file, index=False, encoding='utf-8-sig')
            print(f"[성공] {sig_file}에 시그널 전용 데이터를 누적 저장했습니다. ✅")
        except Exception as e:
            print(f"[에러] 시그널 전용 CSV 저장 실패: {e}")
            
    # 웹에 노출할 정형화된 JSON 데이터 구조 빌드
    parsed_payload = {
        'timestamp': current_time,
        'nate': nate_data,
        'daum': daum_data,
        'zum_keywords': zum_keywords,
        'zum_stocks': zum_stocks,
        'signal': signal_data
    }
    
    # trends.json 파일로 내보내기 (Cloudflare Pages 정적 데이터 연동용)
    try:
        with open("trends.json", "w", encoding="utf-8") as f:
            json.dump(parsed_payload, f, ensure_ascii=False, indent=2)
        print("[성공] trends.json 파일에 최신 데이터가 동기화되었습니다. ✅")
    except Exception as e:
        print(f"[에러] trends.json 저장 실패: {e}")
        
    return parsed_payload

def get_latest_trends_from_csv():
    """CSV 파일로부터 가장 최근에 저장된 수집 데이터를 조회하여 반환합니다."""
    if not os.path.exists(CSV_FILE):
        return {}
        
    try:
        df = pd.read_csv(CSV_FILE, encoding='utf-8-sig')
        if df.empty:
            return {}
            
        # 가장 최근 수집된 Timestamp 구하기
        latest_ts = df['Timestamp'].max()
        latest_df = df[df['Timestamp'] == latest_ts]
        
        # 사이트별 분할
        nate = latest_df[latest_df['Site'] == 'Nate'].to_dict(orient='records')
        daum = latest_df[latest_df['Site'] == 'Daum'].to_dict(orient='records')
        zum_keywords = latest_df[latest_df['Site'] == 'Zum_Keyword'].to_dict(orient='records')
        zum_stocks = latest_df[latest_df['Site'] == 'Zum_Stock'].to_dict(orient='records')
        signal = latest_df[latest_df['Site'] == 'Signal'].to_dict(orient='records')
        
        return {
            'timestamp': latest_ts,
            'nate': nate,
            'daum': daum,
            'zum_keywords': zum_keywords,
            'zum_stocks': zum_stocks,
            'signal': signal
        }
    except Exception as e:
        print(f"[에러] CSV 데이터 조회 오류: {e}")
        return {}

# ==========================================
# 🌐 Flask 웹 서버 구현부
# ==========================================

# template_folder와 static_folder 경로를 워크스페이스 절대 경로로 명시
app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates'),
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/trends', methods=['GET'])
def api_get_trends():
    data = get_latest_trends_from_csv()
    if not data:
        # 데이터가 없다면 첫 실행 겸 즉시 스캔
        data = run_all_crawlers()
    return jsonify(data)

@app.route('/api/scan', methods=['POST'])
def api_run_scan():
    try:
        data = run_all_crawlers()
        return jsonify({'status': 'success', 'data': data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ==========================================
# CLI 실행 메인 함수
# ==========================================

def run_cli_mode():
    print("=" * 60)
    print("   [포털 실시간 트렌드 및 주식 정보 수집기 프로그램 - CLI 모드]")
    print(f"   실행 시간: {get_kst_now_str()}")
    print("=" * 60)
    
    # 크롤러 전체 실행 및 CSV 저장
    data = run_all_crawlers()
    
    # 터미널 출력 시각화
    print("\n" + "=" * 60)
    print("                      [ 실시간 수집 결과 ]")
    print("=" * 60)
    
    print("\n🔹 [시그널] 실시간 인기 검색어 (Top 10)")
    print("-" * 50)
    for item in data['signal']:
        kwd = print_korean_aligned(item['Keyword'], 25)
        print(f" {item['Rank']:2d}. {kwd} | 상태: {item['Detail']}")
        
    print("\n🔹 [다음] 실시간 트렌드 키워드 (Top 10)")
    print("-" * 50)
    for item in data['daum']:
        kwd = print_korean_aligned(item['Keyword'], 25)
        print(f" {item['Rank']:2d}. {kwd} | 변동: {item['Detail']}")
        
    print("\n🔹 [네이트] 실시간 이슈 키워드 (Top 5)")
    print("-" * 50)
    for item in data['nate']:
        kwd = print_korean_aligned(item['Keyword'], 25)
        print(f" {item['Rank']:2d}. {kwd} | 상태: {item['Detail']}")
        
    print("\n🔹 [줌] AI 실시간 이슈 검색어 (Top 10)")
    print("-" * 50)
    for item in data['zum_keywords']:
        kwd = print_korean_aligned(item['Keyword'], 25)
        print(f" {item['Rank']:2d}. {kwd} | 요약: {item['Detail']}")
        
    print("\n🔹 [줌] 지금 뜨는 인기 주식 종목 (Top 25)")
    print("-" * 65)
    for item in data['zum_stocks']:
        kwd = print_korean_aligned(item['Keyword'], 18)
        print(f" {item['Rank']:2d}. {kwd} | {item['Detail']}")
        
    print("\n" + "=" * 60)
    print("   모니터링 프로그램 CLI 동작 완료.")
    print("=" * 60)

def start_background_scheduler():
    """로컬 구동 시 기동 즉시 1회 수집 후 1시간마다 주기적으로 크롤러를 자동 구동하는 백그라운드 스케줄러"""
    def scheduler_loop():
        print("[스케줄러] 로컬 백그라운드 자동 수집 스케줄러 기동 완료. (1시간 주기) ⏰")
        # 서버 시작 시 즉시 1회 초기 자동 수집 실행
        try:
            print(f"[스케줄러] 서버 기동 초기 데이터 자동 수집 시작: {get_kst_now_str()} 🚀")
            run_all_crawlers()
            print(f"[스케줄러] 초기 데이터 자동 수집 완료. 다음 예정 시각: 1시간 뒤 ✅")
        except Exception as e:
            print(f"[스케줄러] 초기 자동 수집 중 오류 발생: {e}")

        while True:
            # 1시간 대기 (3600초)
            time.sleep(3600)
            print(f"\n[스케줄러] 1시간 주기 자동 수집 시작: {get_kst_now_str()} ⏰")
            try:
                run_all_crawlers()
                print(f"[스케줄러] 1시간 주기 자동 수집 완료: {get_kst_now_str()} ✅")
            except Exception as e:
                print(f"[스케줄러] 자동 수집 중 오류 발생: {e}")

    # 데몬 스레드로 기동하여 웹 서버 종료 시 함께 안전하게 프로세스가 닫히도록 처리
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()

if __name__ == '__main__':
    # 명령 파라미터 파싱
    # --web 인자가 있으면 Flask 웹 서버 모드로 구동, 없으면 CLI 1회성 스캔 모드
    if '--web' in sys.argv:
        print("=" * 60)
        print("   [포털 실시간 트렌드 및 주식 정보 수집기 - 웹 서버 모드]")
        print("   -> 대시보드 주소: http://127.0.0.1:5000")
        print("=" * 60)
        
        # 1시간 로컬 백그라운드 자동 수집기 실행
        start_background_scheduler()
        
        # 로컬 개발용이므로 debug=True 적용하여 실행하되,
        # Flask 디버거가 리로더용 자식 프로세스를 복사생성해 스케줄러 스레드가 이중 기동되는 것을 방지하기 위해 use_reloader=False 추가
        app.run(host='127.0.0.1', port=5000, debug=True, use_reloader=False)
    else:
        run_cli_mode()
