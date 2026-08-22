import requests
import threading
# pyrefly: ignore [missing-import]
from bs4 import BeautifulSoup
import json
import re
import time
import random
import sys
import os
import hashlib
import hmac
import secrets
import tempfile
import shutil
import xml.etree.ElementTree as ET
import csv
import io
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote
from datetime import datetime, timezone, timedelta
import pandas as pd

# 한국 표준시(KST, UTC+9) 타임존 정의 (GitHub Actions 클라우드 환경 대응)
KST = timezone(timedelta(hours=9))

def get_kst_now_str():
    """클라우드(UTC) 및 로컬 환경 모두에서 일관된 한국 표준시(KST) 타임스탬프 반환"""
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")

# Flask 관련 모듈 가져오기
# pyrefly: ignore [missing-import]
from flask import Flask, render_template, jsonify, request, send_from_directory

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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def _load_local_env_file():
    """Git에서 제외된 로컬 .env의 단순 KEY=VALUE 설정을 환경 변수로 불러온다."""
    env_path = os.path.join(BASE_DIR, ".env")
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if key and key not in os.environ:
                    os.environ[key] = value.strip().strip('"').strip("'")
    except OSError:
        pass

_load_local_env_file()

CSV_FILE = os.path.join(BASE_DIR, "realtime_trends.csv")
SIGNAL_CSV_FILE = os.path.join(BASE_DIR, "signal_realtime_keywords.csv")
TRENDS_JSON_FILE = os.path.join(BASE_DIR, "trends.json")
BROADCAST_TOP5_FILE = os.path.join(BASE_DIR, "broadcast_top5.json")
SEASON_EVENTS_FILE = os.path.join(BASE_DIR, "season_events.json")
MOVIE_RELEASES_FILE = os.path.join(BASE_DIR, "movie_releases.json")
PERFORMANCES_FILE = os.path.join(BASE_DIR, "performances.json")
NETFLIX_TOP10_FILE = os.path.join(BASE_DIR, "netflix_top10.json")
OFFICIAL_EVENT_SUPPLEMENTS_FILE = os.path.join(BASE_DIR, "official_event_supplements.json")
SYSTEM_INSTRUCTION_FILE = os.path.join(
    BASE_DIR, "skills", "google-ai-studio-keyword-article.md"
)
USER_STORY_INSTRUCTION_FILE = os.path.join(
    BASE_DIR, "skills", "google-ai-studio-user-story.md"
)
ADMIN_CONFIG_FILE = os.path.join(BASE_DIR, ".traffic_catcher_admin.json")
MAX_SYSTEM_INSTRUCTION_LENGTH = 200_000


def _get_instruction_file(instruction_type):
    normalized_type = str(instruction_type or "keyword").strip().lower()
    instruction_files = {
        "keyword": SYSTEM_INSTRUCTION_FILE,
        "story": USER_STORY_INSTRUCTION_FILE,
    }
    if normalized_type not in instruction_files:
        raise ValueError("지원하지 않는 시스템 지침 유형입니다.")
    return normalized_type, instruction_files[normalized_type]


def _load_admin_config():
    try:
        with open(ADMIN_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError, TypeError):
        return {}


def _save_admin_password(password):
    if len(password) < 8:
        raise ValueError("관리자 비밀번호는 8자 이상으로 설정해 주세요.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    payload = {"salt": salt.hex(), "password_hash": digest.hex(), "iterations": 200_000}
    temp_path = ADMIN_CONFIG_FILE + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, ADMIN_CONFIG_FILE)


def _admin_password_is_configured():
    return bool(os.environ.get("TRAFFIC_CATCHER_ADMIN_PASSWORD", "").strip() or _load_admin_config())


def _verify_admin_password(password):
    provided = str(password or "")
    env_password = os.environ.get("TRAFFIC_CATCHER_ADMIN_PASSWORD", "").strip()
    if env_password:
        return hmac.compare_digest(provided, env_password)

    config = _load_admin_config()
    try:
        salt = bytes.fromhex(config["salt"])
        expected = bytes.fromhex(config["password_hash"])
        iterations = int(config.get("iterations", 200_000))
    except (KeyError, ValueError, TypeError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", provided.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def _write_system_instruction(content, instruction_file=SYSTEM_INSTRUCTION_FILE):
    normalized = str(content or "").replace("\r\n", "\n").strip()
    if len(normalized) < 20:
        raise ValueError("시스템 지침 내용이 너무 짧습니다.")
    if len(normalized) > MAX_SYSTEM_INSTRUCTION_LENGTH:
        raise ValueError("시스템 지침은 200,000자를 초과할 수 없습니다.")

    if os.path.exists(instruction_file):
        shutil.copy2(instruction_file, instruction_file + ".bak")
    instruction_dir = os.path.dirname(instruction_file)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=instruction_dir, delete=False, suffix=".tmp"
    ) as temp_file:
        temp_file.write(normalized + "\n")
        temp_path = temp_file.name
    os.replace(temp_path, instruction_file)
    return normalized

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
    """네이트(Nate) 실시간 이슈 키워드 수집 (1위 ~ 10위)"""
    data_url = "https://www.nate.com/js/data/jsonLiveKeywordDataV1.js"
    results = []
    
    try:
        random_delay()
        # 1. 네이트 실시간 키워드 전용 데이터 엔드포인트 직접 호출
        headers = {
            **HEADERS,
            'Referer': 'https://www.nate.com/'
        }
        response = requests.get(data_url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # 네이트 데이터는 EUC-KR / CP949 인코딩으로 서빙됨
        response.encoding = 'euc-kr'
        raw_text = response.text.strip()
        
        # JavaScript 배열 형식 문자열을 JSON 형태로 변환 파싱
        # 예: [["1", "키워드", "s", "0", "표시명"], ...]
        if raw_text.startswith('[') and raw_text.endswith(']'):
            try:
                items = json.loads(raw_text)
                for item in items:
                    if len(item) >= 3:
                        rank = int(item[0])
                        keyword = item[4] if len(item) > 4 and item[4] else item[1]
                        flag = str(item[2]).lower()
                        diff = str(item[3]) if len(item) > 3 else "0"
                        
                        state = "동일"
                        if flag == '+':
                            state = f"상승 {diff}" if diff != "0" else "상승"
                        elif flag == '-':
                            state = f"하락 {diff}" if diff != "0" else "하락"
                        elif flag == 'n':
                            state = "신규"
                        elif flag == 's':
                            state = "동일"
                            
                        results.append({
                            'Site': 'Nate',
                            'Rank': rank,
                            'Keyword': keyword.strip(),
                            'Detail': state
                        })
                if results:
                    return results
            except json.JSONDecodeError:
                pass

        # 2. 실패 시 메인 페이지 HTML 파싱으로 폴백
        fallback_url = "https://www.nate.com"
        fb_res = requests.get(fallback_url, headers=HEADERS, timeout=10)
        fb_res.raise_for_status()
        fb_res.encoding = 'utf-8'
        
        soup = BeautifulSoup(fb_res.text, 'html.parser')
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
                    for position, item in enumerate(data["issueWords"][:10], start=1):
                        rank_change = int(item.get("rank", 0) or 0)
                        keyword = item.get("keyword", "").strip()
                        desc = item.get("data", "").strip()
                        if keyword:
                            if rank_change > 0:
                                change_label = f"상승 {rank_change}"
                            elif rank_change < 0:
                                change_label = f"하락 {abs(rank_change)}"
                            else:
                                change_label = "동일"
                            temp_results.append({
                                'Site': 'Zum_Keyword',
                                'Rank': position,
                                'Keyword': keyword,
                                'Detail': f"{change_label} · {desc if desc else '이슈 정보'}",
                                'Change': change_label
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
                                    volume = stock_item.get("volume")
                                    
                                    if name:
                                        volume_detail = ""
                                        if volume is not None:
                                            try:
                                                volume_detail = f" | 거래량: {int(float(volume)):,}주"
                                            except (TypeError, ValueError):
                                                pass
                                        temp_stocks.append({
                                            'Site': 'Zum_Stock',
                                            'Rank': rank_counter,
                                            'Keyword': name,
                                            'Detail': f"코드: {symbol} | 현재가: {close_price:,}원 | 변동률: {change_percent:+.2f}%{volume_detail}"
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

BROADCAST_CHANNELS = {
    "terrestrial": {
        "KBS1": "KBS1", "KBS2": "KBS2", "MBC": "MBC", "SBS": "SBS"
    },
    "general": {
        "JTBC": "JTBC", "TV CHOSUN": "TV조선", "TV조선": "TV조선",
        "채널A": "채널A", "MBN": "MBN"
    },
    "cable": {
        "tvN": "tvN", "TVN": "tvN", "ENA": "ENA", "Mnet": "Mnet",
        "MNET": "Mnet", "OCN": "OCN"
    },
}

NIELSEN_DAILY_MENUS = {
    "terrestrial": "1_1",
    "general": "2_1",
    "cable": "3_1",
}

def _parse_nielsen_daily_ratings(html, expected_date, category):
    """닐슨 일일 순위의 가구시청률 표만 읽고 지정 채널 데이터로 정규화한다."""
    soup = BeautifulSoup(html, "html.parser")
    page_text = soup.get_text(" ", strip=True)
    displayed_dates = re.findall(r"20\d{2}\.\d{2}\.\d{2}", page_text)
    expected_text = expected_date.strftime("%Y.%m.%d")
    if not displayed_dates or displayed_dates[0] != expected_text:
        return []

    channel_map = BROADCAST_CHANNELS[category]
    rows = []
    for table in soup.find_all("table"):
        # 레이아웃용 바깥 table은 시청률/시청자수 표를 함께 감싸므로 제외한다.
        if table.find("table") is not None:
            continue
        # 닐슨 표는 의미상 헤더도 <th>가 아닌 <td>로 제공한다.
        header_text = " ".join(
            cell.get_text(" ", strip=True)
            for tr in table.find_all("tr")[:4]
            for cell in tr.find_all(["th", "td"])
        )
        if "가구시청률" not in header_text or "시청자수" in header_text:
            continue
        if not all(label in header_text for label in ("순위", "채널", "프로그램", "시청률")):
            continue
        for tr in table.find_all("tr"):
            cells = [cell.get_text(" ", strip=True) for cell in tr.find_all("td")]
            if len(cells) < 4 or not re.fullmatch(r"\d+", cells[0]):
                continue
            raw_channel = re.sub(r"\s+", " ", cells[1]).strip()
            channel = channel_map.get(raw_channel)
            if not channel:
                continue
            rating_match = re.search(r"\d+(?:\.\d+)?", cells[3].replace(",", ""))
            if not rating_match:
                continue
            title = re.sub(r"\s+", " ", cells[2]).strip()
            rows.append({
                "channel": channel,
                "category": category,
                "title": title,
                "rating": float(rating_match.group(0)),
                "rating_date": expected_date.isoformat(),
                "time": "",
            })
        if rows:
            break
    return rows

NAVER_SCHEDULE_GROUPS = (
    ("terrestrial", "100", "1 2 3", {"KBS1", "KBS2", "MBC", "SBS"}),
    ("general", "500", "46", {"JTBC", "MBN", "TV조선", "채널A"}),
    ("cable", "200", "11", {"OCN"}),
    ("cable", "200", "12", {"ENA"}),
    ("cable", "200", "13", {"tvN", "Mnet"}),
)

def _load_naver_schedule_json(response_text):
    """간혹 프로그램명 속 비표준 백슬래시가 포함되는 네이버 JSON을 보정한다."""
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        repaired = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', response_text)
        return json.loads(repaired)

def _normalize_broadcast_channel(name):
    compact = re.sub(r"\s+", "", str(name or ""))
    aliases = {
        "TVCHOSUN": "TV조선", "TV조선": "TV조선", "채널A": "채널A",
        "TVN": "tvN", "tvN": "tvN", "MNET": "Mnet", "Mnet": "Mnet",
    }
    return aliases.get(compact, compact)

def _normalize_program_name(name):
    value = re.sub(r"<[^>]+>|\[[^\]]+\]|\([^)]*\)", "", str(name or ""))
    value = re.sub(r"\d+\s*(?:회|부|화)$", "", value)
    value = re.sub(r"^(?:KBS1|KBS2|MBC|SBS|JTBC|TVN)(?:일일|월화|수목|금토|토일|주말)?(?:드라마|예능)?", "", value, flags=re.I)
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()

def _is_regular_news_program(title):
    """실시간 키워드 영역과 중복되는 정규 뉴스 편성을 제외한다."""
    normalized = re.sub(r"\s+", "", str(title or "")).lower()
    return "뉴스" in normalized or "news" in normalized

NON_ENTERTAINMENT_PROGRAM_PATTERNS = re.compile(
    r"뉴스|news|특보|시사|보도|정치|경제|증시|날씨|다큐|교양|생활정보|건강|"
    r"종교|예배|강연|인간극장|아침마당|6시내고향|"
    r"생생정보|모닝와이드|사건반장|돌직구쇼|뉴스파이터|뉴스룸|퍼레이드|"
    r"굿모닝|오늘n|오늘아침|좋은아침|행복한아침|아침&|생방송투데이|"
    r"내몸|질병의법칙|슈퍼푸드|히든에이지|신통방통|알아야산다|온고지신|"
    r"이가혁라이브|더펀치|블랙박스|이웃집찰스|걸어서세계속으로",
    re.I,
)

def _is_entertainment_focused_program(title):
    """드라마·예능·영화 중심 목록을 위해 명확한 비오락 정규 편성을 제외한다."""
    normalized = re.sub(r"\s+", "", str(title or ""))
    if _is_regular_news_program(normalized):
        return False
    if re.search(r"스포츠|야구|축구|골프|농구|배구|올림픽|월드컵|특별|특집|스페셜|특별편성", normalized, re.I):
        return True
    return bool(normalized) and not NON_ENTERTAINMENT_PROGRAM_PATTERNS.search(normalized)

def _match_recent_rating(title, rating_items):
    normalized_title = _normalize_program_name(title)
    if not normalized_title:
        return None
    best = None
    for item in rating_items:
        normalized_rating_title = _normalize_program_name(item.get("title"))
        if not normalized_rating_title:
            continue
        if normalized_title == normalized_rating_title or (
            min(len(normalized_title), len(normalized_rating_title)) >= 4
            and (normalized_title in normalized_rating_title or normalized_rating_title in normalized_title)
        ):
            if best is None or item["rating_date"] > best["rating_date"]:
                best = item
    return best

def _fetch_naver_channel_names(session, u1, u3):
    response = session.get(
        "https://ts-proxy.naver.com/content/nqapirender.nhn",
        params={"pkid": 66, "where": "nexearch", "key": "ScheduleChannelList", "u1": u1, "u3": u3},
        timeout=15,
    )
    response.raise_for_status()
    payload = _load_naver_schedule_json(response.text)
    soup = BeautifulSoup(payload.get("dataHtml", ""), "html.parser")
    return [_normalize_broadcast_channel(element.get_text(" ", strip=True)) for element in soup.select(".channel_name")]

def _fetch_naver_schedule_window(session, target_date, hour, u1, u3, channel_names, targets):
    response = session.get(
        "https://ts-proxy.naver.com/content/nqapirender.nhn",
        params={
            "pkid": 66, "where": "nexearch", "key": "MultiChannelWeekSchedule",
            "u1": u1, "u3": u3, "u5": f"{target_date.strftime('%Y%m%d')}{hour:02d}0000", "u6": "Y",
        },
        timeout=15,
    )
    response.raise_for_status()
    payload = _load_naver_schedule_json(response.text)
    soup = BeautifulSoup(payload.get("dataHtml", ""), "html.parser")
    columns = soup.select(".list_right .channel_list > li")
    result = {}
    for index, column in enumerate(columns):
        if index >= len(channel_names):
            break
        channel = channel_names[index]
        if channel not in targets:
            continue
        programs = result.setdefault(channel, [])
        for element in column.select(".ind_program"):
            title_element = element.select_one(".pr_title")
            time_element = element.select_one(".time")
            if not title_element or not time_element:
                continue
            title = re.sub(r"\s+", " ", title_element.get_text(" ", strip=True)).strip()
            air_time = time_element.get_text(" ", strip=True).zfill(5)
            if not title or "방송 시간이 아닙니다" in title or not _is_entertainment_focused_program(title):
                continue
            item = {"time": air_time, "title": title}
            if not any(existing["time"] == air_time and existing["title"] == title for existing in programs):
                programs.append(item)
    return result

def crawl_weekly_schedules(week_start):
    """네이버 편성정보에서 이번 주 주요 방송사의 아침/저녁 편성을 가져온다."""
    session = requests.Session()
    session.headers.update({**HEADERS, "Referer": "https://search.naver.com/"})
    channel_groups = []
    for category, u1, u3, targets in NAVER_SCHEDULE_GROUPS:
        try:
            names = _fetch_naver_channel_names(session, u1, u3)
            channel_groups.append((category, u1, u3, targets, names))
        except (requests.RequestException, ValueError, json.JSONDecodeError) as e:
            print(f"[경고] 편성 채널 목록 {category}/{u3} 수집 실패: {e}")

    weekly = {}
    for offset in range(7):
        target_date = week_start + timedelta(days=offset)
        day_data = {}
        for category, u1, u3, targets, names in channel_groups:
            for hour in (8, 19, 22, 23):
                try:
                    window = _fetch_naver_schedule_window(session, target_date, hour, u1, u3, names, targets)
                    for channel, programs in window.items():
                        key = (category, channel)
                        merged = day_data.setdefault(key, [])
                        for program in programs:
                            if not any(item["time"] == program["time"] and item["title"] == program["title"] for item in merged):
                                merged.append(program)
                except (requests.RequestException, ValueError, json.JSONDecodeError) as e:
                    print(f"[경고] {target_date} {category}/{u3} {hour}시 편성 수집 실패: {e}")
        weekly[target_date.isoformat()] = day_data
    return weekly

def crawl_broadcast_top5(force=False):
    """이번 주 방송 편성과 최근 닐슨 시청률을 방송사별 전체 목록으로 저장한다."""
    now = datetime.now(KST)
    if not force and os.path.exists(BROADCAST_TOP5_FILE):
        try:
            with open(BROADCAST_TOP5_FILE, "r", encoding="utf-8") as f:
                cached_payload = json.load(f)
            cached_at = datetime.strptime(cached_payload.get("updated_at", ""), "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
            if now - cached_at < timedelta(hours=6) and cached_payload.get("days"):
                print("[안내] 방송 시청률은 최근 6시간 안에 갱신되어 기존 수집본을 사용합니다.")
                return cached_payload
        except (OSError, ValueError, TypeError):
            pass
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    day_names = ("월", "화", "수", "목", "금", "토", "일")
    days = []
    successful_pages = 0
    weekly_schedules = crawl_weekly_schedules(week_start)

    for offset, day_name in enumerate(day_names):
        target_date = week_start + timedelta(days=offset)
        channels_by_key = {}
        rating_date = target_date if target_date < today else target_date - timedelta(days=7)
        if rating_date <= today:
            for category, sub_menu in NIELSEN_DAILY_MENUS.items():
                url = "https://www.nielsenkorea.co.kr/tv_terrestrial_day.asp"
                params = {
                    "menu": "Tit_1",
                    "sub_menu": sub_menu,
                    "area": "00",
                    "begin_date": rating_date.strftime("%Y%m%d"),
                }
                try:
                    response = requests.get(url, params=params, headers=HEADERS, timeout=15)
                    response.raise_for_status()
                    response.encoding = response.apparent_encoding or "utf-8"
                    ratings = _parse_nielsen_daily_ratings(response.text, rating_date, category)
                    if ratings:
                        successful_pages += 1
                    for item in ratings:
                        key = (item["category"], item["channel"])
                        channels_by_key.setdefault(key, []).append(item)
                except requests.RequestException as e:
                    print(f"[경고] 닐슨 {rating_date} {category} 수집 실패: {e}")

        channels = []
        schedules = weekly_schedules.get(target_date.isoformat(), {})
        for (category, channel_name), scheduled_programs in schedules.items():
            rating_items = channels_by_key.get((category, channel_name), [])
            programs = []
            for scheduled in scheduled_programs:
                matched = _match_recent_rating(scheduled["title"], rating_items)
                programs.append({
                    "time": scheduled["time"], "title": scheduled["title"],
                    "rating": matched["rating"] if matched else None,
                    "rating_date": matched["rating_date"] if matched else "",
                })
            programs.sort(key=lambda item: item["time"])
            all_programs = []
            for rank, item in enumerate(programs, start=1):
                all_programs.append({
                    "rank": rank,
                    "time": item["time"],
                    "title": item["title"],
                    "rating": item["rating"],
                    "rating_date": item["rating_date"],
                })
            if all_programs:
                channels.append({"name": channel_name, "category": category, "programs": all_programs})
        channels.sort(key=lambda item: (list(NIELSEN_DAILY_MENUS).index(item["category"]), item["name"]))
        days.append({
            "date": target_date.isoformat(),
            "day": day_name,
            "label": f"{day_name} {target_date.month}/{target_date.day}",
            "channels": channels,
        })

    payload = {
        "updated_at": get_kst_now_str() if successful_pages else None,
        "source": ["Naver 편성정보", "Nielsen Korea"] if weekly_schedules else (["Nielsen Korea"] if successful_pages else []),
        "basis": "이번 주 실제 편성 전체 · 최근 동일 요일 전국 가구시청률 참고",
        "days": days,
    }
    try:
        with open(BROADCAST_TOP5_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        if successful_pages:
            print(f"[성공] 방송 시청률 {successful_pages}개 일일 순위를 broadcast_top5.json에 저장했습니다. ✅")
        else:
            print("[경고] 방송 시청률을 수집하지 못해 빈 주간 데이터로 저장했습니다.")
    except OSError as e:
        print(f"[에러] broadcast_top5.json 저장 실패: {e}")
    return payload

def _save_season_events(payload):
    temp_path = SEASON_EVENTS_FILE + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, SEASON_EVENTS_FILE)

def _save_discovery_payload(path, payload):
    temp_path = path + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(temp_path, path)

def _load_fresh_discovery_cache(path, label):
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if payload.get("status") == "success":
            cached_at = datetime.strptime(payload.get("updated_at", ""), "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
            if datetime.now(KST) - cached_at < timedelta(hours=6):
                print(f"[안내] {label} 데이터는 최근 6시간 안에 갱신되어 기존 수집본을 사용합니다.")
                return payload, payload
        return payload, None
    except (OSError, ValueError, TypeError, AttributeError):
        return None, None

def crawl_movie_releases(force=False):
    """KOBIS에서 오늘부터 90일 이내 개봉 영화를 수집한다."""
    api_key = (os.getenv("KOBIS_API_KEY") or "").strip()
    cached, fresh = _load_fresh_discovery_cache(MOVIE_RELEASES_FILE, "개봉 영화")
    if not force and fresh:
        return fresh
    basis = "오늘부터 90일 이내 개봉 영화"
    if not api_key:
        if isinstance(cached, dict) and cached.get("items"):
            return cached
        payload = {"updated_at": None, "status": "key_required", "source": ["영화진흥위원회 KOBIS"], "basis": basis, "items": [], "message": "KOBIS_API_KEY 설정이 필요합니다."}
        _save_discovery_payload(MOVIE_RELEASES_FILE, payload)
        return payload

    now = datetime.now(KST)
    range_start = now.strftime("%Y%m%d")
    range_end = (now + timedelta(days=90)).strftime("%Y%m%d")
    try:
        items, seen, page = [], set(), 1
        while page <= 20:
            response = requests.get(
                "https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json",
                params={"key": api_key, "curPage": page, "itemPerPage": 100, "openStartDt": now.strftime("%Y"), "openEndDt": (now + timedelta(days=90)).strftime("%Y")},
                timeout=25,
            )
            response.raise_for_status()
            response_payload = response.json()
            if response_payload.get("faultInfo"):
                raise ValueError(response_payload["faultInfo"].get("message") or "KOBIS API 오류")
            result = response_payload.get("movieListResult")
            if not isinstance(result, dict):
                raise ValueError("KOBIS 응답 형식이 올바르지 않습니다.")
            rows = result.get("movieList", [])
            if not rows:
                break
            for row in rows:
                movie_id = str(row.get("movieCd") or "").strip()
                title = str(row.get("movieNm") or "").strip()
                open_date = str(row.get("openDt") or "").strip()
                if not title or not open_date or not (range_start <= open_date <= range_end) or (movie_id or title) in seen:
                    continue
                seen.add(movie_id or title)
                directors = ", ".join(str(x.get("peopleNm") or "").strip() for x in row.get("directors", []) if x.get("peopleNm"))
                genre = str(row.get("genreAlt") or "").strip()
                nation = str(row.get("nationAlt") or "").strip()
                details = " · ".join(filter(None, [genre, nation, directors]))
                items.append({"id": movie_id, "title": title, "start_date": open_date, "end_date": open_date, "area": details, "genre": genre, "nation": nation, "director": directors, "image": "", "source": "영화진흥위원회 KOBIS", "url": "", "status": str(row.get("prdtStatNm") or "").strip()})
            total = int(result.get("totCnt") or len(items))
            if page * 100 >= total:
                break
            page += 1
        items.sort(key=lambda item: (item["start_date"], item["title"]))
        payload = {"updated_at": get_kst_now_str(), "status": "success", "source": ["영화진흥위원회 KOBIS"], "basis": basis, "items": items, "message": "" if items else "조회 기간에 개봉 예정 영화가 없습니다."}
        _save_discovery_payload(MOVIE_RELEASES_FILE, payload)
        print(f"[성공] 개봉 영화 {len(items)}건을 movie_releases.json에 저장했습니다. ✅")
        return payload
    except (requests.RequestException, ValueError, TypeError, OSError) as e:
        safe_error = str(e).replace(api_key, "***")
        if isinstance(cached, dict) and cached.get("items"):
            print(f"[경고] 개봉 영화 수집 실패로 기존 수집본을 유지합니다: {safe_error}")
            return cached
        payload = {"updated_at": None, "status": "error", "source": ["영화진흥위원회 KOBIS"], "basis": basis, "items": [], "message": f"개봉 영화 수집 실패: {safe_error}"}
        _save_discovery_payload(MOVIE_RELEASES_FILE, payload)
        return payload

def crawl_performances(force=False):
    """KOPIS에서 오늘부터 90일 이내 공연을 수집한다."""
    api_key = (os.getenv("KOPIS_API_KEY") or "").strip()
    cached, fresh = _load_fresh_discovery_cache(PERFORMANCES_FILE, "공연")
    if not force and fresh:
        return fresh
    basis = "오늘부터 90일 이내 공연"
    if not api_key:
        if isinstance(cached, dict) and cached.get("items"):
            return cached
        payload = {"updated_at": None, "status": "key_required", "source": ["공연예술통합전산망 KOPIS"], "basis": basis, "items": [], "message": "KOPIS_API_KEY 설정이 필요합니다."}
        _save_discovery_payload(PERFORMANCES_FILE, payload)
        return payload

    now = datetime.now(KST)
    try:
        items, seen = [], set()
        window_start = now
        final_date = now + timedelta(days=90)
        while window_start <= final_date:
            window_end = min(window_start + timedelta(days=30), final_date)
            page = 1
            while page <= 30:
                response = requests.get(
                    "https://www.kopis.or.kr/openApi/restful/pblprfr",
                    params={"service": api_key, "stdate": window_start.strftime("%Y%m%d"), "eddate": window_end.strftime("%Y%m%d"), "cpage": page, "rows": 100},
                    timeout=25,
                )
                response.raise_for_status()
                root = ET.fromstring(response.content)
                rows = root.findall(".//db")
                if not rows:
                    break
                for row in rows:
                    get = lambda tag: (row.findtext(tag) or "").strip()
                    performance_id, title = get("mt20id"), get("prfnm")
                    if not title or (performance_id or title) in seen:
                        continue
                    seen.add(performance_id or title)
                    start_date = re.sub(r"\D", "", get("prfpdfrom"))
                    end_date = re.sub(r"\D", "", get("prfpdto"))
                    genre = get("genrenm")
                    items.append({"id": performance_id, "title": title, "start_date": start_date, "end_date": end_date, "sort_date": max(start_date, now.strftime("%Y%m%d")), "area": " · ".join(filter(None, [get("area"), get("fcltynm"), genre])), "genre": genre, "venue": get("fcltynm"), "region": get("area"), "image": get("poster"), "source": "공연예술통합전산망 KOPIS", "url": f"https://www.kopis.or.kr/mob/db/pblprfrView.do?mt20Id={performance_id}" if performance_id else "", "status": get("prfstate")})
                if len(rows) < 100:
                    break
                page += 1
            window_start = window_end + timedelta(days=1)
        items.sort(key=lambda item: (item.get("sort_date") or "99999999", item["title"]))
        payload = {"updated_at": get_kst_now_str(), "status": "success", "source": ["공연예술통합전산망 KOPIS"], "basis": basis, "items": items, "message": "" if items else "조회 기간에 수집된 공연이 없습니다."}
        _save_discovery_payload(PERFORMANCES_FILE, payload)
        print(f"[성공] 공연 {len(items)}건을 performances.json에 저장했습니다. ✅")
        return payload
    except (requests.RequestException, ET.ParseError, ValueError, TypeError, OSError) as e:
        safe_error = str(e).replace(api_key, "***")
        if isinstance(cached, dict) and cached.get("items"):
            print(f"[경고] 공연 수집 실패로 기존 수집본을 유지합니다: {safe_error}")
            return cached
        payload = {"updated_at": None, "status": "error", "source": ["공연예술통합전산망 KOPIS"], "basis": basis, "items": [], "message": f"공연 수집 실패: {safe_error}"}
        _save_discovery_payload(PERFORMANCES_FILE, payload)
        return payload

def _read_netflix_tsv(url):
    response = requests.get(url, headers={"User-Agent": HEADERS["User-Agent"]}, timeout=60)
    response.raise_for_status()
    return list(csv.DictReader(io.StringIO(response.text), delimiter="\t"))

def _netflix_number(value, as_float=False):
    try:
        return float(value) if as_float else int(float(value))
    except (TypeError, ValueError):
        return 0.0 if as_float else 0

def _translate_netflix_title(title):
    if not title or re.search(r"[가-힣]", title):
        return title
    try:
        response = requests.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "en", "tl": "ko", "dt": "t", "q": title},
            headers={"User-Agent": HEADERS["User-Agent"]}, timeout=12,
        )
        response.raise_for_status()
        translated = "".join(str(part[0]) for part in response.json()[0] if part and part[0]).strip()
        return translated if translated and translated.casefold() != title.casefold() else ""
    except (requests.RequestException, ValueError, TypeError, IndexError):
        return ""

def crawl_netflix_top10(force=False):
    """넷플릭스 공식 주간 TSV에서 한국 및 글로벌 최신 Top 10을 수집한다."""
    cached, fresh = _load_fresh_discovery_cache(NETFLIX_TOP10_FILE, "넷플릭스 OTT 인기")
    if not force and fresh:
        return fresh
    try:
        country_rows = _read_netflix_tsv("https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv")
        global_rows = _read_netflix_tsv("https://www.netflix.com/tudum/top10/data/all-weeks-global.tsv")
        korea_rows = [row for row in country_rows if str(row.get("country_iso2") or "").upper() == "KR"]
        latest_country_week = max((row.get("week") or "" for row in korea_rows), default="")
        latest_global_week = max((row.get("week") or "" for row in global_rows), default="")
        lists = {key: [] for key in ("korea_films", "korea_tv", "global_films_english", "global_films_non_english", "global_tv_english", "global_tv_non_english")}

        def normalized_item(row, include_metrics=False):
            item = {
                "rank": _netflix_number(row.get("weekly_rank")), "title": str(row.get("show_title") or "").strip(),
                "season": str(row.get("season_title") or "").strip().replace("N/A", ""),
                "category": str(row.get("category") or ""), "week": str(row.get("week") or ""),
                "weeks_in_top10": _netflix_number(row.get("cumulative_weeks_in_top_10")), "source": "Netflix Top 10",
            }
            if include_metrics:
                item.update({"weekly_views": _netflix_number(row.get("weekly_views")), "weekly_hours_viewed": _netflix_number(row.get("weekly_hours_viewed")), "runtime": _netflix_number(row.get("runtime"), as_float=True)})
            return item

        for row in korea_rows:
            if row.get("week") != latest_country_week:
                continue
            category = str(row.get("category") or "")
            target = "korea_films" if "Films" in category else "korea_tv" if "TV" in category else ""
            if target:
                lists[target].append(normalized_item(row))
        global_targets = {"Films (English)": "global_films_english", "Films (Non-English)": "global_films_non_english", "TV (English)": "global_tv_english", "TV (Non-English)": "global_tv_non_english"}
        for row in global_rows:
            if row.get("week") == latest_global_week and str(row.get("category") or "") in global_targets:
                lists[global_targets[str(row.get("category") or "")]].append(normalized_item(row, include_metrics=True))
        for rows in lists.values():
            rows.sort(key=lambda item: item["rank"])
        if not latest_country_week or not latest_global_week or not any(lists.values()):
            raise ValueError("넷플릭스 최신 주간 순위를 찾지 못했습니다.")
        cached_translations = {
            str(item.get("title") or ""): str(item.get("title_ko") or "")
            for item in (cached.get("items", []) if isinstance(cached, dict) else [])
            if item.get("title") and item.get("title_ko")
        }
        unique_titles = sorted({item["title"] for rows in lists.values() for item in rows if item.get("title")})
        missing_titles = [title for title in unique_titles if title not in cached_translations]
        if missing_titles:
            with ThreadPoolExecutor(max_workers=8) as executor:
                translated_titles = executor.map(_translate_netflix_title, missing_titles)
            cached_translations.update({title: translated for title, translated in zip(missing_titles, translated_titles) if translated})
        for rows in lists.values():
            for item in rows:
                item["title_ko"] = cached_translations.get(item["title"], "")
        payload = {"updated_at": get_kst_now_str(), "status": "success", "source": ["Netflix Tudum Top 10"], "basis": f"한국 {latest_country_week} · 글로벌 {latest_global_week} 주간 Top 10", "country_week": latest_country_week, "global_week": latest_global_week, "lists": lists, "items": [item for rows in lists.values() for item in rows], "message": ""}
        _save_discovery_payload(NETFLIX_TOP10_FILE, payload)
        print(f"[성공] 넷플릭스 OTT 인기 {sum(len(rows) for rows in lists.values())}건을 netflix_top10.json에 저장했습니다. ✅")
        return payload
    except (requests.RequestException, ValueError, TypeError, OSError, csv.Error) as e:
        if isinstance(cached, dict) and cached.get("status") == "success" and cached.get("lists"):
            print(f"[경고] 넷플릭스 수집 실패로 기존 수집본을 유지합니다: {e}")
            return cached
        payload = {"updated_at": None, "status": "error", "source": ["Netflix Tudum Top 10"], "basis": "넷플릭스 공식 주간 Top 10", "lists": {}, "items": [], "message": f"넷플릭스 인기 데이터 수집 실패: {e}"}
        _save_discovery_payload(NETFLIX_TOP10_FILE, payload)
        return payload

def crawl_season_events(force=False):
    """TourAPI의 실제 축제·행사 데이터를 수집한다. 실패 시 임의 기본값을 만들지 않는다."""
    service_key = unquote(
        (os.getenv("TOUR_API_SERVICE_KEY") or os.getenv("DATA_GO_KR_SERVICE_KEY") or "").strip()
    )
    cached_payload = None
    if os.path.exists(SEASON_EVENTS_FILE):
        try:
            with open(SEASON_EVENTS_FILE, "r", encoding="utf-8") as f:
                cached_payload = json.load(f)
        except (OSError, ValueError, TypeError):
            cached_payload = None

    if not force and isinstance(cached_payload, dict) and cached_payload.get("status") == "success":
        try:
            cached_at = datetime.strptime(cached_payload.get("updated_at", ""), "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
            if datetime.now(KST) - cached_at < timedelta(hours=6):
                print("[안내] 축제·행사는 최근 6시간 안에 갱신되어 기존 TourAPI 수집본을 사용합니다.")
                return cached_payload
        except (ValueError, TypeError):
            pass

    if not service_key:
        if isinstance(cached_payload, dict) and cached_payload.get("items"):
            print("[안내] TourAPI 인증키가 없어 기존 축제·행사 수집본을 유지합니다.")
            return cached_payload
        payload = {
            "updated_at": None,
            "status": "key_required",
            "source": ["한국관광공사 TourAPI"],
            "basis": "오늘부터 90일 이내 전국 축제·행사",
            "items": [],
            "message": "TOUR_API_SERVICE_KEY 설정이 필요합니다.",
        }
        _save_season_events(payload)
        print("[안내] TourAPI 인증키가 없어 축제·행사 수집을 건너뜁니다.")
        return payload

    now = datetime.now(KST)
    try:
        raw_items = []
        page_no = 1
        page_size = 100
        total_count = None
        while total_count is None or len(raw_items) < total_count:
            response = requests.get(
                "https://apis.data.go.kr/B551011/KorService2/searchFestival2",
                params={
                    "serviceKey": service_key,
                    "MobileOS": "ETC",
                    "MobileApp": "TrafficCatcher",
                    "_type": "json",
                    "numOfRows": page_size,
                    "pageNo": page_no,
                    "arrange": "A",
                    "eventStartDate": now.strftime("%Y%m%d"),
                    "eventEndDate": (now + timedelta(days=90)).strftime("%Y%m%d"),
                },
                headers={"User-Agent": HEADERS["User-Agent"], "Accept": "application/json"},
                timeout=25,
            )
            response.raise_for_status()
            api_response = response.json().get("response", {})
            api_header = api_response.get("header", {})
            result_code = str(api_header.get("resultCode") or "").strip()
            if result_code and result_code != "0000":
                raise ValueError(api_header.get("resultMsg") or f"TourAPI 오류 코드 {result_code}")
            body = api_response.get("body", {})
            total_count = int(body.get("totalCount") or 0)
            page_items = body.get("items", {})
            page_items = page_items.get("item", []) if isinstance(page_items, dict) else []
            if isinstance(page_items, dict):
                page_items = [page_items]
            if not isinstance(page_items, list) or not page_items:
                break
            raw_items.extend(page_items)
            page_no += 1
            if page_no > 20:
                print("[경고] TourAPI 안전 한도 2,000건에서 페이지 수집을 중단합니다.")
                break

        items = []
        seen = set()
        for item in raw_items if isinstance(raw_items, list) else []:
            title = str(item.get("title") or "").strip()
            content_id = str(item.get("contentid") or "").strip()
            if not title or (content_id or title) in seen:
                continue
            seen.add(content_id or title)
            items.append({
                "id": content_id,
                "title": title,
                "start_date": str(item.get("eventstartdate") or ""),
                "end_date": str(item.get("eventenddate") or ""),
                "area": str(item.get("addr1") or "").strip(),
                "image": str(item.get("firstimage") or item.get("firstimage2") or "").strip(),
                "source": "한국관광공사 TourAPI",
                "url": "",
            })

        supplement_sources = []
        try:
            with open(OFFICIAL_EVENT_SUPPLEMENTS_FILE, "r", encoding="utf-8") as f:
                supplements = json.load(f)
            range_start = now.strftime("%Y%m%d")
            range_end = (now + timedelta(days=90)).strftime("%Y%m%d")
            for item in supplements if isinstance(supplements, list) else []:
                title = str(item.get("title") or "").strip()
                start_date = str(item.get("start_date") or "").strip()
                end_date = str(item.get("end_date") or start_date).strip()
                item_id = str(item.get("id") or f"official-{title}-{start_date}")
                if not title or not start_date or end_date < range_start or start_date > range_end:
                    continue
                if item_id in seen or any(existing["title"] == title and existing["start_date"] == start_date for existing in items):
                    continue
                seen.add(item_id)
                source_name = str(item.get("source") or "공식기관 행사정보").strip()
                supplement_sources.append(source_name)
                items.append({
                    "id": item_id,
                    "title": title,
                    "start_date": start_date,
                    "end_date": end_date,
                    "area": str(item.get("area") or "").strip(),
                    "image": str(item.get("image") or "").strip(),
                    "source": source_name,
                    "url": str(item.get("url") or "").strip(),
                })
        except (OSError, ValueError, TypeError) as e:
            print(f"[경고] 공식기관 행사 보완 데이터 로드 실패: {e}")
        items.sort(key=lambda item: (item.get("start_date") or "99999999", item["title"]))
        payload = {
            "updated_at": get_kst_now_str(),
            "status": "success",
            "source": ["한국관광공사 TourAPI", *sorted(set(supplement_sources))],
            "basis": "오늘부터 90일 이내 전국 축제·행사",
            "items": items,
            "message": "" if items else "조회 기간에 수집된 축제·행사가 없습니다.",
        }
        _save_season_events(payload)
        print(f"[성공] 축제·행사 {len(items)}건을 season_events.json에 저장했습니다. ✅")
        return payload
    except (requests.RequestException, ValueError, TypeError, OSError) as e:
        if isinstance(cached_payload, dict) and cached_payload.get("items"):
            print(f"[경고] 축제·행사 수집 실패로 기존 수집본을 유지합니다: {e}")
            return cached_payload
        payload = {
            "updated_at": None,
            "status": "error",
            "source": ["한국관광공사 TourAPI"],
            "basis": "오늘부터 90일 이내 전국 축제·행사",
            "items": [],
            "message": f"축제·행사 수집 실패: {e}",
        }
        _save_season_events(payload)
        print(f"[경고] 축제·행사 수집 실패: {e}")
        return payload

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

    print("📺 이번 주 방송사별 시청률 TOP 5 수집 중...")
    crawl_broadcast_top5()

    print("🎪 시즌 축제·행사 정보 수집 중...")
    crawl_season_events()

    print("🎬 개봉 영화 정보 수집 중...")
    crawl_movie_releases()

    print("🎭 공연 정보 수집 중...")
    crawl_performances()

    print("📺 넷플릭스 OTT 주간 인기 정보 수집 중...")
    crawl_netflix_top10()
    
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
        sig_file = SIGNAL_CSV_FILE
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
    
    # 모든 수집처가 실패했을 때 정상 데이터를 빈 JSON으로 덮어쓰지 않는다.
    if all_data:
        try:
            with open(TRENDS_JSON_FILE, "w", encoding="utf-8") as f:
                json.dump(parsed_payload, f, ensure_ascii=False, indent=2)
            print("[성공] trends.json 파일에 최신 데이터가 동기화되었습니다. ✅")
        except Exception as e:
            print(f"[에러] trends.json 저장 실패: {e}")
    else:
        print("[경고] 모든 수집처가 실패했습니다. 기본값이나 과거 데이터를 대신 반환하지 않습니다.")
        
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
        latest_df = df[df['Timestamp'] == latest_ts].copy()

        # Pandas NaN is not valid JSON and makes browser response.json() fail.
        latest_df = latest_df.astype(object).where(pd.notna(latest_df), None)
        
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

@app.route('/api/broadcast-top5', methods=['GET'])
def api_get_broadcast_top5():
    """정적 배포와 로컬 서버가 동일한 주간 방송 편성 원본을 사용하도록 제공한다."""
    try:
        with open(BROADCAST_TOP5_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict) or not isinstance(payload.get("days"), list):
            raise ValueError("방송 데이터 형식이 올바르지 않습니다.")
        return jsonify(payload)
    except (OSError, ValueError, TypeError) as e:
        return jsonify({"updated_at": None, "days": [], "error": str(e)})

@app.route('/api/season-events', methods=['GET'])
def api_get_season_events():
    """로컬과 정적 배포가 같은 TourAPI 축제·행사 원본을 사용하도록 제공한다."""
    try:
        with open(SEASON_EVENTS_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            raise ValueError("축제·행사 데이터 형식이 올바르지 않습니다.")
        return jsonify(payload)
    except (OSError, ValueError, TypeError) as e:
        return jsonify({"updated_at": None, "status": "error", "items": [], "message": str(e)})

def _serve_discovery_file(path, label):
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            raise ValueError(f"{label} 데이터 형식이 올바르지 않습니다.")
        return jsonify(payload)
    except (OSError, ValueError, TypeError) as e:
        return jsonify({"updated_at": None, "status": "error", "items": [], "message": str(e)})

@app.route('/api/movie-releases', methods=['GET'])
def api_get_movie_releases():
    return _serve_discovery_file(MOVIE_RELEASES_FILE, "개봉 영화")

@app.route('/api/performances', methods=['GET'])
def api_get_performances():
    return _serve_discovery_file(PERFORMANCES_FILE, "공연")

@app.route('/api/netflix-top10', methods=['GET'])
def api_get_netflix_top10():
    try:
        with open(NETFLIX_TOP10_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict) or not isinstance(payload.get("lists"), dict):
            raise ValueError("넷플릭스 데이터 형식이 올바르지 않습니다.")
        return jsonify(payload)
    except (OSError, ValueError, TypeError) as e:
        return jsonify({"updated_at": None, "status": "error", "lists": {}, "items": [], "message": str(e)})

@app.route('/api/system_instruction', methods=['GET'])
def api_system_instruction():
    """브라우저와 Python 생성기가 같은 시스템 지침 원본을 사용하도록 제공한다."""
    try:
        with open(SYSTEM_INSTRUCTION_FILE, "r", encoding="utf-8") as f:
            return jsonify({'status': 'success', 'instruction': f.read()})
    except OSError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/user_story_instruction', methods=['GET'])
def api_user_story_instruction():
    """내 스토리 기사 전용 Gemini 시스템 지침 원본을 제공한다."""
    try:
        with open(USER_STORY_INSTRUCTION_FILE, 'r', encoding='utf-8') as f:
            return jsonify({'status': 'success', 'instruction': f.read()})
    except OSError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/admin/system_instruction', methods=['GET', 'PUT'])
def api_admin_system_instruction():
    """로컬 관리자 인증 후 키워드/스토리 시스템 지침을 각각 조회하거나 저장한다."""
    password = request.headers.get('X-Admin-Password', '')
    configured = _admin_password_is_configured()
    req_data = request.get_json(silent=True) or {}
    try:
        instruction_type, instruction_file = _get_instruction_file(
            request.args.get('type') or req_data.get('instruction_type') or 'keyword'
        )
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

    if request.method == 'PUT' and not configured:
        try:
            _save_admin_password(password)
            configured = True
        except (OSError, ValueError) as e:
            return jsonify({'status': 'setup_required', 'message': str(e)}), 428

    if not configured:
        return jsonify({
            'status': 'setup_required',
            'message': '최초 관리자 비밀번호를 입력한 뒤 저장 버튼을 눌러 설정해 주세요.'
        }), 428

    if not _verify_admin_password(password):
        return jsonify({'status': 'error', 'message': '관리자 비밀번호가 올바르지 않습니다.'}), 401

    if request.method == 'GET':
        try:
            with open(instruction_file, 'r', encoding='utf-8') as f:
                content = f.read()
            stat = os.stat(instruction_file)
            return jsonify({
                'status': 'success',
                'instruction_type': instruction_type,
                'instruction': content,
                'updated_at': datetime.fromtimestamp(stat.st_mtime, KST).strftime('%Y-%m-%d %H:%M:%S'),
                'length': len(content)
            })
        except OSError as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500

    try:
        saved_content = _write_system_instruction(req_data.get('instruction', ''), instruction_file)
        return jsonify({
            'status': 'success',
            'instruction_type': instruction_type,
            'message': '시스템 지침이 저장되었습니다. 다음 기사부터 즉시 적용됩니다.',
            'instruction': saved_content,
            'length': len(saved_content)
        })
    except (OSError, ValueError) as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/scan', methods=['POST'])
def api_run_scan():
    try:
        data = run_all_crawlers()
        return jsonify({'status': 'success', 'data': data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

def scrape_news_article(url):
    """
    뉴스 기사 URL에 직접 접속하여 제목, 언론사명, 본문 텍스트를 실시간으로 크롤링/스크래핑하는 함수
    """
    if not url or not url.startswith('http'):
        return {'status': 'error', 'message': '올바른 URL이 아닙니다.'}
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.encoding = resp.apparent_encoding or 'utf-8'
        if resp.status_code != 200:
            return {'status': 'error', 'message': f'HTTP 상태 코드 {resp.status_code}'}
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # 불필요한 태그 제거
        for tag in soup(['script', 'style', 'header', 'footer', 'nav', 'aside', 'iframe', 'noscript', 'button', 'form']):
            tag.decompose()
            
        # 언론사명 추출
        press = ''
        og_site = soup.find('meta', property='og:site_name')
        if og_site and og_site.get('content'):
            press = og_site['content'].strip()
        if not press:
            press_logo = soup.select_one('.media_end_head_top_logo img, .press_logo img, .logo img')
            if press_logo and press_logo.get('alt'):
                press = press_logo['alt'].strip()
        if not press:
            import urllib.parse
            domain = urllib.parse.urlparse(url).netloc
            press = domain.replace('www.', '').split('.')[0].upper()
            
        # 제목 추출
        title = ''
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title = og_title['content'].strip()
        if not title:
            h1_tag = soup.find('h1')
            if h1_tag:
                title = h1_tag.get_text().strip()
        if not title and soup.title:
            title = soup.title.get_text().strip()
            
        # 기사 본문 영역 셀렉터 탐색
        content_selectors = [
            '#dic_area', '#articeBody', '#newsct_article', '#articleBodyContents',  # 네이버 뉴스
            '#harmonyContainer', '.article_view', '#cSub .news_view',               # 다음 뉴스
            '.article_body', '#article_body', '.article-body', '.article_txt',      # 조선/중앙/동아
            '#article_text', '.story-news', '.news_body', '#news_body_id',        # 연합/한겨레/경향
            'article', '[itemprop="articleBody"]', '.view_con', '.content_area'     # 일반 언론사
        ]
        
        body_elem = None
        for sel in content_selectors:
            found = soup.select_one(sel)
            if found and len(found.get_text().strip()) > 80:
                body_elem = found
                break
                
        if not body_elem:
            body_elem = soup.body or soup
            
        # 본문 내 잔여 광고/기자정보 제거
        for ad in body_elem.select('.ad_wrap, .ad_box, .byline, .reporter_area, .copyright, .vod_player, .sns_share'):
            ad.decompose()
            
        raw_text = body_elem.get_text(separator='\n')
        # 빈 줄 및 공백 정제
        cleaned_lines = [line.strip() for line in raw_text.split('\n') if len(line.strip()) > 5]
        article_content = '\n\n'.join(cleaned_lines)
        
        if len(article_content) < 50:
            return {'status': 'error', 'message': '기사 본문 텍스트를 충분히 추출하지 못했습니다.'}
            
        return {
            'status': 'success',
            'url': url,
            'title': title,
            'press': press,
            'content': article_content
        }
    except Exception as e:
        return {'status': 'error', 'message': f'기사 스크래핑 실패: {str(e)}'}

def search_and_scrape_3_news(keyword):
    """
    키워드로 네이버 뉴스 검색을 수행하여 서로 다른 3대 언론사의 실제 개별 기사 URL 및 본문을 크롤링하는 함수
    """
    import urllib.parse
    enc_kwd = urllib.parse.quote(keyword)
    search_url = f"https://search.naver.com/search.naver?where=news&query={enc_kwd}&sort=0"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
    
    articles = []
    seen_press = set()
    
    try:
        resp = requests.get(search_url, headers=headers, timeout=10)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            news_items = soup.select('.news_wrap, .list_news > li')
            
            for item in news_items:
                if len(articles) >= 3:
                    break
                    
                # 언론사명
                press_el = item.select_one('.info_group .press, .info.press, a.info')
                press_name = press_el.get_text().strip() if press_el else '언론사'
                if press_name in seen_press:
                    continue
                    
                # 네이버뉴스 링크 우선 탐색
                naver_link_el = item.select_one('.info_group a[href*="news.naver.com"], .info_group a[href*="n.news.naver.com"]')
                tit_el = item.select_one('.news_tit, a.tit')
                
                if not tit_el:
                    continue
                    
                target_url = naver_link_el['href'] if naver_link_el else tit_el['href']
                title = tit_el.get_text().strip()
                
                if target_url and target_url.startswith('http'):
                    # 실제 본문 스크래핑
                    scraped = scrape_news_article(target_url)
                    content = scraped.get('content', '') if scraped.get('status') == 'success' else ''
                    
                    articles.append({
                        'press': press_name,
                        'title': title,
                        'url': target_url,
                        'content': content
                    })
                    seen_press.add(press_name)
    except Exception as e:
        print(f"[뉴스 검색 실패] {e}")
        
    return articles

def search_youtube_videos(keyword, max_results=3, api_key=None):
    """YouTube Data API v3 search.list로 키워드 관련 영상을 검색한다."""
    key = (api_key or os.environ.get('YOUTUBE_API_KEY') or os.environ.get('GEMINI_API_KEY') or '').strip()
    if not key:
        print('[YouTube Data API] API Key가 없어 영상 검색을 건너뜁니다.')
        return []

    params = {
        'part': 'snippet', 'q': keyword, 'type': 'video',
        'maxResults': max(1, min(int(max_results), 50)), 'order': 'relevance',
        'regionCode': 'KR', 'relevanceLanguage': 'ko', 'key': key,
    }
    try:
        resp = requests.get('https://www.googleapis.com/youtube/v3/search', params=params, timeout=15)
        if resp.status_code != 200:
            error_data = resp.json() if 'json' in resp.headers.get('content-type', '') else {}
            message = error_data.get('error', {}).get('message') or f'HTTP {resp.status_code}'
            print(f'[YouTube Data API 검색 실패] {message}')
            return []
        videos = []
        for item in resp.json().get('items', []):
            video_id = item.get('id', {}).get('videoId')
            snippet = item.get('snippet', {})
            if not video_id:
                continue
            thumbnails = snippet.get('thumbnails', {})
            thumbnail = (thumbnails.get('high') or thumbnails.get('medium') or thumbnails.get('default') or {}).get('url', '')
            description = snippet.get('description', '')
            videos.append({
                'videoId': video_id, 'title': snippet.get('title', ''),
                'channel': snippet.get('channelTitle', '유튜브 채널'),
                'press': snippet.get('channelTitle', '유튜브 채널'),
                'thumbnail': thumbnail or f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg',
                'url': f'https://www.youtube.com/watch?v={video_id}',
                'content': f'[영상 설명]\n{description}' if description else f"[유튜브] {snippet.get('title', keyword)}",
                'transcript': f'[영상 설명]\n{description}' if description else f"[유튜브] {snippet.get('title', keyword)}",
            })
        return videos
    except Exception as e:
        print(f'[YouTube Data API 검색 실패] {e}')
        return []

def get_youtube_transcript(video_id_or_url):
    """
    유튜브 비디오 ID 또는 URL로부터 실제 자막(Transcript/CC) 텍스트를 추출하는 함수
    """
    import re
    import json
    import xml.etree.ElementTree as ET
    
    vid = video_id_or_url
    if 'v=' in video_id_or_url:
        vid = video_id_or_url.split('v=')[1].split('&')[0]
    elif 'youtu.be/' in video_id_or_url:
        vid = video_id_or_url.split('youtu.be/')[1].split('?')[0]
        
    watch_url = f"https://www.youtube.com/watch?v={vid}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
    
    try:
        resp = requests.get(watch_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return {'status': 'error', 'message': f'HTTP 상태 {resp.status_code}'}
            
        match = re.search(r'var ytInitialPlayerResponse = ({.*?});</script>', resp.text)
        if not match:
            match = re.search(r'ytInitialPlayerResponse\s*=\s*({.+?});', resp.text)
            
        title = ''
        channel = ''
        description = ''
        transcript_text = ''
        
        if match:
            player_data = json.loads(match.group(1))
            video_details = player_data.get('videoDetails', {})
            title = video_details.get('title', '')
            channel = video_details.get('author', '')
            description = video_details.get('shortDescription', '')
            
            # 자막 트랙 확인
            captions = player_data.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
            target_track = None
            for track in captions:
                lang = track.get('languageCode', '')
                if lang in ['ko', 'ko-KR']:
                    target_track = track
                    break
            if not target_track and captions:
                target_track = captions[0]
                
            if target_track and target_track.get('baseUrl'):
                cap_resp = requests.get(target_track['baseUrl'], timeout=10)
                if cap_resp.status_code == 200:
                    try:
                        root = ET.fromstring(cap_resp.text)
                        lines = []
                        for elem in root.findall('.//text'):
                            t = (elem.text or '').strip()
                            if t:
                                import html
                                t = html.unescape(t)
                                lines.append(t)
                        transcript_text = '\n'.join(lines)
                    except Exception as ex:
                        print(f"자막 XML 파싱 에러: {ex}")
                        
        if not transcript_text and description:
            transcript_text = f"[영상 상세 설명 및 핵심 요약]\n{description[:1000]}"
            
        return {
            'status': 'success',
            'videoId': vid,
            'title': title,
            'channel': channel,
            'thumbnail': f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            'url': watch_url,
            'transcript': transcript_text
        }
    except Exception as e:
        return {'status': 'error', 'message': f'유튜브 자막 추출 실패: {str(e)}'}

def search_google_news_rss(keyword, max_results=3):
    """
    구글 뉴스 공식 RSS 피드를 통해 키워드로 실시간 최신 기사/동영상 데이터를 100% 수집하는 함수
    """
    import urllib.parse
    import xml.etree.ElementTree as ET
    
    enc_kwd = urllib.parse.quote(keyword)
    rss_url = f"https://news.google.com/rss/search?q={enc_kwd}&hl=ko&gl=KR&ceid=KR:ko"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
    
    items = []
    try:
        resp = requests.get(rss_url, headers=headers, timeout=10)
        if resp.status_code == 200:
            root = ET.fromstring(resp.text)
            for el in root.findall('.//item'):
                if len(items) >= max_results:
                    break
                tit = el.find('title')
                link = el.find('link')
                desc = el.find('description')
                source = el.find('source')
                
                title_text = (tit.text or '').strip() if tit is not None else '뉴스 기사'
                link_text = (link.text or '').strip() if link is not None else ''
                press_text = (source.text or '').strip() if source is not None else '구글 뉴스'
                
                # 본문 정제
                desc_text = ''
                if desc is not None and desc.text:
                    soup_desc = BeautifulSoup(desc.text, 'html.parser')
                    desc_text = soup_desc.get_text().strip()
                    
                items.append({
                    'title': title_text,
                    'url': link_text,
                    'press': press_text,
                    'channel': press_text,
                    'thumbnail': 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=400&q=80',
                    'content': desc_text or f"[{press_text}] {title_text}\n실시간 구글 검색 결과 팩트를 바탕으로 원고를 구성합니다.",
                    'transcript': desc_text or f"[{press_text}] {title_text}\n실시간 구글 검색 결과 팩트를 바탕으로 원고를 구성합니다."
                })
    except Exception as e:
        print(f"[구글 RSS 검색 에러] {e}")
        
    return items

@app.route('/api/google_search', methods=['POST'])
def api_google_search():
    try:
        req_data = request.get_json() or {}
        keyword = req_data.get('keyword', '').strip()
        if not keyword:
            return jsonify({'status': 'error', 'message': '키워드가 필요합니다.'}), 400
            
        items = search_google_news_rss(keyword, max_results=3)
        return jsonify({'status': 'success', 'keyword': keyword, 'items': items})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/youtube_search', methods=['POST'])
def api_youtube_search():
    try:
        req_data = request.get_json() or {}
        keyword = req_data.get('keyword', '').strip()
        api_key = req_data.get('api_key', '').strip() or None
        if not keyword:
            return jsonify({'status': 'error', 'message': '키워드가 필요합니다.'}), 400
            
        videos = search_youtube_videos(keyword, max_results=3, api_key=api_key)
        return jsonify({'status': 'success', 'keyword': keyword, 'videos': videos})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/youtube_transcript', methods=['POST'])
def api_youtube_transcript():
    try:
        req_data = request.get_json() or {}
        url_or_id = req_data.get('url', '').strip() or req_data.get('videoId', '').strip()
        if not url_or_id:
            return jsonify({'status': 'error', 'message': '동영상 URL 또는 ID가 필요합니다.'}), 400
            
        res = get_youtube_transcript(url_or_id)
        if res.get('status') == 'success':
            return jsonify(res)
        else:
            return jsonify(res), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/search_news', methods=['POST'])
@app.route('/api/naver_news_top3', methods=['POST'])
def api_search_news():
    try:
        req_data = request.get_json() or {}
        keyword = req_data.get('keyword', '').strip()
        if not keyword:
            return jsonify({'status': 'error', 'message': '키워드가 필요합니다.'}), 400
            
        articles = search_and_scrape_3_news(keyword)
        return jsonify({'status': 'success', 'keyword': keyword, 'articles': articles})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/fetch_article', methods=['POST'])
def api_fetch_article():
    try:
        req_data = request.get_json() or {}
        url = req_data.get('url', '').strip()
        if not url:
            return jsonify({'status': 'error', 'message': 'URL이 필요합니다.'}), 400
            
        res = scrape_news_article(url)
        if res.get('status') == 'success':
            return jsonify(res)
        else:
            return jsonify(res), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/generate_content', methods=['POST'])
def api_generate_content():
    try:
        req_data = request.get_json() or {}
        keyword = req_data.get('keyword', '').strip()
        article_mode = req_data.get('article_mode', 'keyword').strip()
        facts = req_data.get('facts', '').strip()
        source_title = req_data.get('source_title', '').strip()
        source_url = req_data.get('source_url', '').strip()
        portal_source = req_data.get('portal_source', '').strip()
        story_content = req_data.get('story_content', '').strip()
        story_type = req_data.get('story_type', '뉴스 기사형').strip()
        story_request = req_data.get('story_request', '').strip()
        api_key = req_data.get('api_key', '').strip() or None
        model_name = req_data.get('model_name', 'gemini-3.5-flash-lite').strip()
        model_aliases = {
            'gemini-flash-lite-latest': 'gemini-3.5-flash-lite',
            'gemini-flash-latest': 'gemini-3.6-flash',
            'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
            'gemini-2.5-flash': 'gemini-3.6-flash',
        }
        model_name = model_aliases.get(model_name, model_name or 'gemini-3.5-flash-lite')
        
        if not keyword:
            return jsonify({'status': 'error', 'message': '기사 주제 또는 키워드가 필요합니다.'}), 400
        if article_mode == 'story' and len(story_content) < 30:
            return jsonify({'status': 'error', 'message': '내 스토리·원고를 30자 이상 입력해 주세요.'}), 400
        if article_mode == 'keyword' and (not source_title or not facts):
            return jsonify({'status': 'error', 'message': '기준 기사 제목과 수집 본문이 필요합니다.'}), 400

        selected_article_facts = ''
        if article_mode == 'keyword':
            selected_article_facts = (
                f"제목: {source_title}\n"
                f"언론사: {portal_source or '뉴스 출처'}\n"
                f"원문 링크: {source_url}\n"
                f"수집 본문:\n{facts[:12000]}"
            )

        print(f"[AI API] 기사 생성 요청 수신: keyword='{keyword}', model='{model_name}'")
        from ai_studio_code import generate_article
        result = generate_article(
            keyword=keyword,
            facts=selected_article_facts,
            portal_source=portal_source,
            api_key=api_key,
            model_name=model_name,
            return_dict=True,
            article_mode=article_mode,
            story_content=story_content,
            story_type=story_type,
            story_request=story_request,
        )
        if not isinstance(result, dict) or not result.get('blog_post_markdown'):
            raise RuntimeError('AI 생성 결과에 기사 본문이 없습니다.')
        print(f"[AI API] 기사 생성 완료: keyword='{keyword}', chars={len(result['blog_post_markdown'])}")
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        print(f"[AI API] 기사 생성 실패: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/revise_content', methods=['POST'])
def api_revise_content():
    try:
        req_data = request.get_json() or {}
        keyword = req_data.get('keyword', '').strip()
        original_markdown = req_data.get('original_markdown', '').strip()
        revision_request = req_data.get('revision_request', '').strip()
        api_key = req_data.get('api_key', '').strip() or None
        model_name = req_data.get('model_name', 'gemini-3.5-flash-lite').strip()
        model_aliases = {
            'gemini-flash-lite-latest': 'gemini-3.5-flash-lite',
            'gemini-flash-latest': 'gemini-3.6-flash',
            'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
            'gemini-2.5-flash': 'gemini-3.6-flash',
        }
        model_name = model_aliases.get(model_name, model_name or 'gemini-3.5-flash-lite')
        from ai_studio_code import revise_article
        result = revise_article(
            keyword=keyword,
            original_markdown=original_markdown,
            revision_request=revision_request,
            api_key=api_key,
            model_name=model_name,
        )
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        print(f"[AI API] 기사 보완 실패: {e}")
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
        
    print("\n🔹 [네이트] 실시간 이슈 키워드 (Top 10)")
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
    """로컬 구동 시 기동 즉시 1회 수집 후 15분마다 주기적으로 크롤러를 자동 구동하는 백그라운드 스케줄러"""
    def scheduler_loop():
        print("[스케줄러] 로컬 백그라운드 자동 수집 스케줄러 기동 완료. (15분 주기) ⏰")
        # 서버 시작 시 즉시 1회 초기 자동 수집 실행
        try:
            print(f"[스케줄러] 서버 기동 초기 데이터 자동 수집 시작: {get_kst_now_str()} 🚀")
            run_all_crawlers()
            print(f"[스케줄러] 초기 데이터 자동 수집 완료. 다음 예정 시각: 15분 뒤 ✅")
        except Exception as e:
            print(f"[스케줄러] 초기 자동 수집 중 오류 발생: {e}")

        while True:
            # 15분 대기 (900초)
            time.sleep(900)
            print(f"\n[스케줄러] 15분 주기 자동 수집 시작: {get_kst_now_str()} ⏰")
            try:
                run_all_crawlers()
                print(f"[스케줄러] 15분 주기 자동 수집 완료: {get_kst_now_str()} ✅")
            except Exception as e:
                print(f"[스케줄러] 자동 수집 중 오류 발생: {e}")

    # 데몬 스레드로 기동하여 웹 서버 종료 시 함께 안전하게 프로세스가 닫히도록 처리
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()

if __name__ == '__main__':
    # 명령 파라미터 파싱
    # --web 인자가 있으면 Flask 웹 서버 모드로 구동, 없으면 CLI 1회성 스캔 모드
    if '--web' in sys.argv:
        web_port = int(os.environ.get('TRAFFIC_CATCHER_PORT', '5000'))
        print("=" * 60)
        print("   [포털 실시간 트렌드 및 주식 정보 수집기 - 웹 서버 모드]")
        print(f"   -> 대시보드 주소: http://127.0.0.1:{web_port}")
        print("=" * 60)
        
        # 15분 로컬 백그라운드 자동 수집기 실행
        start_background_scheduler()
        
        # 로컬 개발용이므로 debug=True 적용하여 실행하되,
        # Flask 디버거가 리로더용 자식 프로세스를 복사생성해 스케줄러 스레드가 이중 기동되는 것을 방지하기 위해 use_reloader=False 추가
        app.run(host='127.0.0.1', port=web_port, debug=True, use_reloader=False)
    else:
        run_cli_mode()
