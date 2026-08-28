import { getAiModelCatalog, getAuthenticatedUser, handleAdminRequest, handleAuthRequest, hasFeature } from './cloud_auth.js';

const WORKER_BUILD_ID = '20260828-cloud-data-store-7';

const TRAFFIC_DATA_FILES = Object.freeze({
    'trends.json': { apiPath: '/api/trends', contentType: 'application/json; charset=utf-8', hot: true },
    'broadcast_top5.json': { apiPath: '/api/broadcast-top5', contentType: 'application/json; charset=utf-8', hot: true },
    'season_events.json': { apiPath: '/api/season-events', contentType: 'application/json; charset=utf-8', hot: true },
    'movie_releases.json': { apiPath: '/api/movie-releases', contentType: 'application/json; charset=utf-8', hot: true },
    'performances.json': { apiPath: '/api/performances', contentType: 'application/json; charset=utf-8', hot: true },
    'netflix_top10.json': { apiPath: '/api/netflix-top10', contentType: 'application/json; charset=utf-8', hot: true },
    'realtime_trends.csv': { apiPath: '', contentType: 'text/csv; charset=utf-8', hot: false },
    'signal_realtime_keywords.csv': { apiPath: '', contentType: 'text/csv; charset=utf-8', hot: false },
});

const TRAFFIC_DATA_BY_API_PATH = Object.freeze(Object.fromEntries(
    Object.entries(TRAFFIC_DATA_FILES)
        .filter(([, config]) => config.apiPath)
        .map(([fileName, config]) => [config.apiPath, { fileName, ...config }]),
));

async function secureTextEquals(left, right) {
    const encoder = new TextEncoder();
    const [leftHash, rightHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(String(left || ''))),
        crypto.subtle.digest('SHA-256', encoder.encode(String(right || ''))),
    ]);
    const leftBytes = new Uint8Array(leftHash);
    const rightBytes = new Uint8Array(rightHash);
    let difference = 0;
    for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
    return difference === 0;
}

function trafficDataCacheRequest(request, pathname) {
    const canonicalUrl = new URL(pathname, request.url);
    canonicalUrl.search = '';
    return new Request(canonicalUrl.toString(), { method: 'GET' });
}

async function readTrafficDataObject(env, fileName) {
    const config = TRAFFIC_DATA_FILES[fileName];
    if (!config) return null;

    if (config.hot && env.TRAFFIC_DATA_KV) {
        const stored = await env.TRAFFIC_DATA_KV.getWithMetadata(fileName, 'arrayBuffer');
        if (stored?.value) return { body: stored.value, metadata: stored.metadata || {}, source: 'kv' };
    }

    if (env.TRAFFIC_DATA_ARCHIVE) {
        const object = await env.TRAFFIC_DATA_ARCHIVE.get(`latest/${fileName}`);
        if (object) return { body: object.body, metadata: object.customMetadata || {}, source: 'r2' };
    }
    return null;
}

async function serveTrafficData(request, env, pathname, ctx) {
    const config = TRAFFIC_DATA_BY_API_PATH[pathname];
    if (!config || request.method !== 'GET') return null;

    const cache = globalThis.caches?.default;
    const cacheRequest = trafficDataCacheRequest(request, pathname);
    if (cache) {
        const cached = await cache.match(cacheRequest);
        if (cached) return cached;
    }

    const stored = await readTrafficDataObject(env, config.fileName);
    if (!stored) return jsonResponse({ status: 'error', message: 'Cloudflare에 수집된 데이터가 없습니다.' }, 404, 'no-store');

    const headers = new Headers({
        'Content-Type': config.contentType,
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'X-Traffic-Data-Source': stored.source,
    });
    if (stored.metadata?.updatedAt) headers.set('X-Traffic-Data-Updated-At', stored.metadata.updatedAt);
    const response = new Response(stored.body, { status: 200, headers });
    if (cache && ctx) ctx.waitUntil(cache.put(cacheRequest, response.clone()));
    return response;
}

async function ingestTrafficData(request, env, pathname) {
    const prefix = '/api/data/ingest/';
    if (!pathname.startsWith(prefix) || request.method !== 'PUT') return null;

    const fileName = decodeURIComponent(pathname.slice(prefix.length));
    const config = TRAFFIC_DATA_FILES[fileName];
    if (!config) return jsonResponse({ status: 'error', message: '허용되지 않은 데이터 파일입니다.' }, 404);

    const expectedToken = String(env.DATA_INGEST_TOKEN || '').trim();
    const suppliedToken = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!expectedToken || !suppliedToken || !(await secureTextEquals(suppliedToken, expectedToken))) {
        return jsonResponse({ status: 'error', message: '데이터 업로드 권한이 없습니다.' }, 401);
    }
    if (!env.TRAFFIC_DATA_KV && !env.TRAFFIC_DATA_ARCHIVE) {
        return jsonResponse({ status: 'error', message: 'TRAFFIC_DATA_KV 또는 TRAFFIC_DATA_ARCHIVE 바인딩이 필요합니다.' }, 503);
    }
    if (!config.hot && !env.TRAFFIC_DATA_ARCHIVE) {
        return jsonResponse({ status: 'error', message: 'CSV 원본 저장에는 TRAFFIC_DATA_ARCHIVE 바인딩이 필요합니다.' }, 503);
    }

    const body = await request.arrayBuffer();
    if (!body.byteLength) return jsonResponse({ status: 'error', message: '빈 데이터는 저장할 수 없습니다.' }, 400);
    if (config.hot && body.byteLength > 25 * 1024 * 1024) {
        return jsonResponse({ status: 'error', message: 'KV 저장 한도(25MiB)를 초과했습니다.' }, 413);
    }

    const updatedAt = new Date().toISOString();
    const metadata = { updatedAt, contentType: config.contentType, size: String(body.byteLength) };
    const writes = [];
    if (config.hot && env.TRAFFIC_DATA_KV) writes.push(env.TRAFFIC_DATA_KV.put(fileName, body, { metadata }));
    if (env.TRAFFIC_DATA_ARCHIVE) {
        writes.push(env.TRAFFIC_DATA_ARCHIVE.put(`latest/${fileName}`, body, {
            httpMetadata: { contentType: config.contentType },
            customMetadata: metadata,
        }));
    }
    await Promise.all(writes);

    const cache = globalThis.caches?.default;
    if (cache && config.apiPath) await cache.delete(trafficDataCacheRequest(request, config.apiPath));
    return jsonResponse({
        status: 'success',
        file: fileName,
        bytes: body.byteLength,
        updated_at: updatedAt,
        stored: { kv: Boolean(config.hot && env.TRAFFIC_DATA_KV), r2: Boolean(env.TRAFFIC_DATA_ARCHIVE) },
    });
}

async function trafficDataStatus(env) {
    const files = [];
    for (const [fileName, config] of Object.entries(TRAFFIC_DATA_FILES)) {
        if (!config.hot || !env.TRAFFIC_DATA_KV) continue;
        const stored = await env.TRAFFIC_DATA_KV.getWithMetadata(fileName, 'arrayBuffer');
        files.push({ file: fileName, available: Boolean(stored?.value), metadata: stored?.metadata || null });
    }
    return jsonResponse({
        status: 'success',
        storage: { kv: Boolean(env.TRAFFIC_DATA_KV), r2: Boolean(env.TRAFFIC_DATA_ARCHIVE) },
        files,
    }, 200, 'no-store');
}

function decodeXml(value = '') {
    return String(value)
        .replace(/^<!\[CDATA\[|\]\]>$/g, '')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
}

function stripHtml(value = '') {
    return decodeXml(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function readXmlTag(block, tagName) {
    const match = String(block || '').match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
    return match ? decodeXml(match[1]) : '';
}

function parseGoogleNewsRss(xmlText, maxResults = 3) {
    return [...String(xmlText || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        .slice(0, Math.max(1, maxResults))
        .map((match) => {
            const block = match[1];
            const title = stripHtml(readXmlTag(block, 'title'));
            const url = readXmlTag(block, 'link').trim();
            const press = stripHtml(readXmlTag(block, 'source')) || 'Google News';
            const description = stripHtml(readXmlTag(block, 'description'));
            return {
                title,
                url,
                originallink: url,
                naverLink: '',
                press,
                channel: press,
                content: description || `[${press}] ${title}`,
                transcript: description || `[${press}] ${title}`,
                pubDate: readXmlTag(block, 'pubDate'),
                sourceType: 'google-news-rss',
            };
        })
        .filter((item) => item.title && /^https?:\/\//i.test(item.url));
}

function jsonResponse(payload, status = 200, cacheControl = 'no-store') {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': cacheControl,
        },
    });
}

const NEWS_PRESS_BY_DOMAIN = Object.freeze({
    'biz.chosun.com': '조선비즈', 'yna.co.kr': '연합뉴스', 'yonhapnewstv.co.kr': '연합뉴스TV',
    'newsis.com': '뉴시스', 'news1.kr': '뉴스1', 'chosun.com': '조선일보',
    'donga.com': '동아일보', 'joongang.co.kr': '중앙일보', 'hani.co.kr': '한겨레',
    'khan.co.kr': '경향신문', 'kmib.co.kr': '국민일보', 'munhwa.com': '문화일보',
    'segye.com': '세계일보', 'mk.co.kr': '매일경제', 'hankyung.com': '한국경제',
    'sedaily.com': '서울경제', 'edaily.co.kr': '이데일리', 'mt.co.kr': '머니투데이',
    'asiae.co.kr': '아시아경제', 'fnnews.com': '파이낸셜뉴스', 'heraldcorp.com': '헤럴드경제',
    'etnews.com': '전자신문', 'zdnet.co.kr': 'ZDNet Korea', 'dt.co.kr': '디지털타임스',
    'ddaily.co.kr': '디지털데일리', 'inews24.com': '아이뉴스24', 'bloter.net': '블로터',
    'ohmynews.com': '오마이뉴스', 'pressian.com': '프레시안', 'nocutnews.co.kr': '노컷뉴스',
    'ytn.co.kr': 'YTN', 'sbs.co.kr': 'SBS', 'kbs.co.kr': 'KBS', 'imbc.com': 'MBC',
    'mbn.co.kr': 'MBN', 'jtbc.co.kr': 'JTBC', 'tvchosun.com': 'TV조선',
    'ichannela.com': '채널A', 'sportschosun.com': '스포츠조선', 'sportsseoul.com': '스포츠서울',
    'spotvnews.co.kr': '스포티비뉴스', 'xportsnews.com': '엑스포츠뉴스',
    'osen.co.kr': 'OSEN', 'starnews.com': '스타뉴스', 'newsen.com': '뉴스엔',
});

function naverNewsPress(item = {}) {
    const candidate = String(item.originallink || item.link || '');
    try {
        const host = new URL(candidate).hostname.toLowerCase().replace(/^www\./i, '');
        if (host === 'news.naver.com' || host === 'n.news.naver.com') return '네이버 뉴스';
        const domain = Object.keys(NEWS_PRESS_BY_DOMAIN)
            .find((known) => host === known || host.endsWith('.' + known));
        return domain ? NEWS_PRESS_BY_DOMAIN[domain] : (host || '네이버 뉴스');
    } catch (_) {
        return '네이버 뉴스';
    }
}

async function fetchNaverNewsItems(keyword, env, maxResults = 5) {
    if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
        throw new Error('Cloudflare Secret NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.');
    }
    const searchUrl = new URL('https://naverapihub.apigw.ntruss.com/search/v1/news');
    searchUrl.searchParams.set('query', keyword);
    searchUrl.searchParams.set('display', String(Math.max(1, Math.min(100, maxResults))));
    searchUrl.searchParams.set('start', '1');
    searchUrl.searchParams.set('sort', 'date');
    searchUrl.searchParams.set('format', 'json');
    const upstream = await fetch(searchUrl, {
        headers: {
            'Accept': 'application/json',
            'X-NCP-APIGW-API-KEY-ID': String(env.NAVER_CLIENT_ID),
            'X-NCP-APIGW-API-KEY': String(env.NAVER_CLIENT_SECRET),
        },
        signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
        throw new Error(data.errorMessage || data.message || `네이버 뉴스 API HTTP ${upstream.status}`);
    }
    return (Array.isArray(data.items) ? data.items : []).slice(0, maxResults).map((item) => {
        const title = stripHtml(item.title || '');
        const description = stripHtml(item.description || '');
        const url = String(item.originallink || item.link || '').trim();
        const press = naverNewsPress(item);
        return {
            title,
            url,
            originallink: String(item.originallink || '').trim(),
            naverLink: String(item.link || '').trim(),
            press,
            channel: press,
            content: description || `[${press}] ${title}`,
            transcript: description || `[${press}] ${title}`,
            pubDate: String(item.pubDate || ''),
            sourceType: 'naver-news',
        };
    }).filter((item) => item.title && /^https?:\/\//i.test(item.url));
}

function mergeUniqueNewsItems(primaryItems, fallbackItems, maxResults = 3) {
    const merged = [];
    const seenUrls = new Set();
    const seenTitles = new Set();
    for (const item of [...primaryItems, ...fallbackItems]) {
        const urlKey = String(item?.url || '').trim().toLowerCase();
        const titleKey = String(item?.title || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!urlKey || !titleKey || seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
        seenUrls.add(urlKey);
        seenTitles.add(titleKey);
        merged.push(item);
        if (merged.length >= maxResults) break;
    }
    return merged;
}

async function fetchGoogleNewsRssItems(keyword, env, maxResults = 3) {
    const rssUrl = new URL('https://news.google.com/rss/search');
    rssUrl.searchParams.set('q', keyword);
    rssUrl.searchParams.set('hl', 'ko');
    rssUrl.searchParams.set('gl', 'KR');
    rssUrl.searchParams.set('ceid', 'KR:ko');
    const headers = {
        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    let directError = null;
    try {
        const direct = await fetch(rssUrl, {
            headers,
            signal: AbortSignal.timeout(5000),
            cf: { cacheTtl: 300, cacheEverything: true },
        });
        if (!direct.ok) throw new Error(`Google News RSS HTTP ${direct.status}`);
        const items = parseGoogleNewsRss(await direct.text(), maxResults);
        if (items.length) return { items, route: 'direct' };
        directError = new Error('Google News RSS 유효 기사 없음');
    } catch (error) {
        directError = error;
    }

    const koreaProxy = getKoreaProxyConfig(env);
    if (koreaProxy.configured) {
        try {
            const relayed = await fetchThroughKoreaProxy(koreaProxy, rssUrl.toString(), 'GET', headers, undefined, 8000);
            if (!relayed.ok) throw new Error(`Google News RSS 프록시 HTTP ${relayed.status}`);
            const items = parseGoogleNewsRss(await relayed.text(), maxResults);
            if (items.length) return { items, route: 'korea-relay' };
            throw new Error('Google News RSS 프록시 유효 기사 없음');
        } catch (error) {
            throw new Error(`${directError?.message || 'Google News RSS 직접 요청 실패'} / ${error?.message || '프록시 요청 실패'}`);
        }
    }
    throw directError || new Error('Google News RSS 수집 실패');
}

async function handleNaverNewsSearch(request, env) {
    if (request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: 'POST 요청만 지원합니다.', items: [] }, 405);
    }

    let user;
    try { user = await getAuthenticatedUser(request, env); }
    catch (error) { return jsonResponse({ status: 'error', message: error.message, items: [] }, 503); }
    if (!user) return jsonResponse({ status: 'error', message: '로그인이 필요합니다.', items: [] }, 401);

    try {
        const payload = await request.json();
        const keyword = String(payload?.keyword || '').trim().slice(0, 120);
        if (!keyword) return jsonResponse({ status: 'error', message: '검색 키워드가 없습니다.', items: [] }, 400);

        const startedAt = Date.now();
        const items = await fetchNaverNewsItems(keyword, env, 5);

        return jsonResponse({
            status: 'success',
            keyword,
            items,
            source: 'Naver News Search API',
            elapsedMs: Date.now() - startedAt,
        });
    } catch (error) {
        return jsonResponse(
            { status: 'error', message: error?.message || '네이버 뉴스 검색 실패', items: [] },
            502,
        );
    }
}

async function handleCombinedNewsSearch(request, env) {
    if (request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: 'POST 요청만 지원합니다.', items: [] }, 405);
    }
    let user;
    try { user = await getAuthenticatedUser(request, env); }
    catch (error) { return jsonResponse({ status: 'error', message: error.message, items: [] }, 503); }
    if (!user) return jsonResponse({ status: 'error', message: '로그인이 필요합니다.', items: [] }, 401);

    const payload = await request.json().catch(() => ({}));
    const keyword = String(payload?.keyword || '').trim().slice(0, 120);
    if (!keyword) return jsonResponse({ status: 'error', message: '검색 키워드가 없습니다.', items: [] }, 400);

    const startedAt = Date.now();
    const modeRow = await env.AUTH_DB.prepare(
        "SELECT setting_value FROM service_settings WHERE setting_key='news_search_mode'",
    ).first();
    const validModes = new Set(['naver_only', 'google_only', 'naver_then_google', 'google_then_naver']);
    const mode = validModes.has(modeRow?.setting_value) ? modeRow.setting_value : 'google_then_naver';
    const providerOrder = {
        naver_only: ['naver'],
        google_only: ['google'],
        naver_then_google: ['naver', 'google'],
        google_then_naver: ['google', 'naver'],
    }[mode];
    let items = [];
    let googleError = '';
    let naverError = '';
    for (const provider of providerOrder) {
        if (items.length >= 3) break;
        try {
            const providerItems = provider === 'google'
                ? (await fetchGoogleNewsRssItems(keyword, env, 3)).items
                : await fetchNaverNewsItems(keyword, env, 5);
            items = mergeUniqueNewsItems(items, providerItems, 3);
        } catch (error) {
            if (provider === 'google') googleError = error?.message || 'Google News RSS 수집 실패';
            else naverError = error?.message || '네이버 뉴스 검색 실패';
        }
    }
    if (!items.length) {
        return jsonResponse({
            status: 'error',
            keyword,
            mode,
            items: [],
            message: [googleError, naverError].filter(Boolean).join(' / ') || '뉴스 검색 결과가 없습니다.',
            providers: [],
        }, 502);
    }

    const providers = [...new Set(items.map((item) => item.sourceType === 'naver-news'
        ? 'Naver News Search API' : 'Google News RSS'))];
    return jsonResponse({
        status: 'success',
        keyword,
        items,
        source: providers.join(' + '),
        providers,
        mode,
        fallbackUsed: providerOrder.length > 1 && items.some((item) => item.sourceType === (
            providerOrder[1] === 'google' ? 'google-news-rss' : 'naver-news'
        )),
        elapsedMs: Date.now() - startedAt,
    });
}

async function handleNaverSearchTrend(request, env) {
    if (request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: 'POST 요청만 지원합니다.', results: [] }, 405);
    }
    if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
        return jsonResponse({ status: 'error', message: 'NAVER API HUB Secret이 설정되지 않았습니다.', results: [] }, 503);
    }
    let user;
    try { user = await getAuthenticatedUser(request, env); }
    catch (error) { return jsonResponse({ status: 'error', message: error.message, results: [] }, 503); }
    if (!user) return jsonResponse({ status: 'error', message: '로그인이 필요합니다.', results: [] }, 401);
    const permission = await env.AUTH_DB.prepare(
        'SELECT enabled FROM role_feature_permissions WHERE role=? AND feature_key=?',
    ).bind(user.role, 'dashboard.extended').first();
    if (permission && !permission.enabled) {
        return jsonResponse({ status: 'error', message: '확장 대시보드 이용 권한이 없습니다.', results: [] }, 403);
    }
    const payload = await request.json().catch(() => ({}));

    try {
        const keywords = [...new Set((Array.isArray(payload.keywords) ? payload.keywords : [])
            .map((value) => String(value || '').trim().slice(0, 50)).filter(Boolean))].slice(0, 5);
        if (!keywords.length) return jsonResponse({ status: 'error', message: '분석할 키워드가 없습니다.', results: [] }, 400);

        const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const endDate = kstNow.toISOString().slice(0, 10);
        const start = new Date(`${endDate}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - 6);
        const startDate = start.toISOString().slice(0, 10);
        const trendStopwords = new Set(['관련', '실시간', '뉴스', '속보', '오늘', '만의', '대한', '발표', '논란', '공개']);
        const keywordGroups = keywords.map((keyword) => {
            const tokens = keyword.match(/[0-9A-Za-z가-힣]+/g) || [];
            const variants = [...new Set([keyword, ...tokens.filter((token) => token.length >= 2 && !trendStopwords.has(token))])].slice(0, 6);
            return { groupName: keyword, keywords: variants };
        });
        const requestBody = JSON.stringify({ startDate, endDate, timeUnit: 'date', keywordGroups });
        let upstream;
        let data = {};
        for (let attempt = 0; attempt < 2; attempt += 1) {
            upstream = await fetch('https://naverapihub.apigw.ntruss.com/search-trend/v1/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-NCP-APIGW-API-KEY-ID': String(env.NAVER_CLIENT_ID),
                    'X-NCP-APIGW-API-KEY': String(env.NAVER_CLIENT_SECRET),
                },
                body: requestBody,
                signal: AbortSignal.timeout(10000),
            });
            data = await upstream.json().catch(() => ({}));
            if (!upstream.ok || (Array.isArray(data.results) && data.results.length)) break;
            if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 350));
        }
        if (!upstream.ok) {
            return jsonResponse({ status: 'error', message: data.message || `검색어 트렌드 API HTTP ${upstream.status}`, results: [] }, upstream.status >= 500 ? 502 : upstream.status);
        }
        return jsonResponse({
            status: 'success', source: 'NAVER API HUB 검색어 트렌드',
            startDate: data.startDate || startDate, endDate: data.endDate || endDate,
            timeUnit: data.timeUnit || 'date', results: Array.isArray(data.results) ? data.results : [],
        });
    } catch (error) {
        return jsonResponse({ status: 'error', message: error?.message || '네이버 검색어 트렌드 조회 실패', results: [] }, 502);
    }
}

const GEMINI_MODELS = new Set([
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview',
]);
const BACKGROUND_AI_MODELS = new Set(['gemini-3.7-flash', 'gemini-3.1-pro-preview']);
const BACKGROUND_AI_MAX_WAIT_MS = 5 * 60 * 1000;
const DEFAULT_AI_INSTRUCTION_SECTIONS = Object.freeze({ absolute: true, selected: true, persona: true, conflict: true });

function normalizeAiInstructionSections(value) {
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (_) { value = {}; }
    }
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(DEFAULT_AI_INSTRUCTION_SECTIONS).map(([key, enabled]) => [key, key in value ? Boolean(value[key]) : enabled]));
}

async function getUserAiInstructionSections(env, userId) {
    const row = await env.AUTH_DB.prepare(
        'SELECT absolute, selected, persona, conflict FROM user_ai_instruction_sections WHERE user_id = ?',
    ).bind(userId).first();
    return normalizeAiInstructionSections(row);
}

function getKoreaProxyConfig(env) {
    const url = String(env.KOREA_AI_PROXY_URL || '').trim();
    const key = String(env.KOREA_AI_PROXY_KEY || '').trim();
    const secure = /^https:\/\//i.test(url);
    const insecureAllowed = String(env.KOREA_AI_PROXY_ALLOW_INSECURE || '').toLowerCase() === 'true';
    const validUrl = secure || (insecureAllowed && /^http:\/\//i.test(url));
    return { url, key, secure, configured: validUrl && key.length >= 32 };
}

async function fetchThroughKoreaProxy(config, targetUrl, method, headers, body, timeout) {
    const proxyPayload = { targetUrl, method, headers };
    if (body !== undefined) proxyPayload.body = body;
    const proxyResponse = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.key },
        body: JSON.stringify(proxyPayload),
        signal: AbortSignal.timeout(timeout),
    });
    const proxyText = await proxyResponse.text();
    let envelope;
    try { envelope = JSON.parse(proxyText); }
    catch (_) { envelope = null; }
    if (!proxyResponse.ok || !envelope || envelope.success !== true) {
        const detail = envelope?.message || envelope?.error || envelope?.data?.error || envelope?.data?.message
            || (typeof envelope?.data === 'string' ? envelope.data : '');
        const rawMessage = typeof detail === 'string' ? detail : detail?.message || '';
        const cleanMessage = rawMessage.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        const message = cleanMessage || `한국 서버 프록시 HTTP ${proxyResponse.status} · ${WORKER_BUILD_ID}`;
        return new Response(JSON.stringify({ error: { message } }), {
            status: proxyResponse.ok ? 502 : proxyResponse.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
    }
    const data = envelope.data;
    const targetError = data && typeof data === 'object' ? data.error : null;
    const status = Number(targetError?.code);
    return new Response(typeof data === 'string' ? data : JSON.stringify(data ?? {}), {
        status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

function describeAiServerError(error, routeMode = 'direct') {
    const raw = String(error?.message || error || '').replace(/\s+/g, ' ').trim();
    if (/abort|timeout|timed out/i.test(raw)) {
        return routeMode === 'korea_relay'
            ? '한국 서버 경유 AI 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
            : 'AI API 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (/fetch failed|network|connection|connect|socket|ECONN|ENOTFOUND/i.test(raw)) {
        return routeMode === 'korea_relay'
            ? '한국 서버 프록시 또는 AI API에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'
            : 'AI API 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (/D1_|database|SQLITE|no such table|AUTH_DB/i.test(raw)) {
        return '회원 권한 또는 AI 설정 정보를 조회하지 못했습니다.';
    }
    return 'AI API 처리 중 서버 오류가 발생했습니다.';
}

async function handleGeminiProxy(request, env, pathname) {
    let user;
    try { user = await getAuthenticatedUser(request, env); }
    catch (error) { return jsonResponse({ status: 'error', message: error.message }, 503); }
    if (!user) return jsonResponse({ status: 'error', message: '로그인이 필요합니다.' }, 401);
    const writePermission = await env.AUTH_DB.prepare(
        'SELECT enabled FROM role_feature_permissions WHERE role=? AND feature_key=?',
    ).bind(user.role, 'ai.write').first();
    if (!writePermission?.enabled) return jsonResponse({ status: 'error', message: '현재 회원 등급에는 AI 글쓰기 권한이 없습니다.' }, 403);

    const routeRow = await env.AUTH_DB.prepare(
        "SELECT setting_value FROM service_settings WHERE setting_key='ai_route'",
    ).first();
    const routeMode = routeRow?.setting_value === 'korea_relay' ? 'korea_relay' : 'direct';
    const useKoreaRelay = routeMode === 'korea_relay';
    const koreaProxy = getKoreaProxyConfig(env);
    if (useKoreaRelay && !koreaProxy.configured) {
        return jsonResponse({ status: 'error', configured: false, route: routeMode, message: '한국 서버 AI 중계 설정이 완료되지 않았습니다.' }, 503);
    }
    if (!env.GEMINI_API_KEY) {
        return jsonResponse({ status: 'error', configured: false, route: routeMode, message: 'Cloudflare Secret AI API 키가 설정되지 않았습니다.' }, 503);
    }
    const publicModels = await getAiModelCatalog(env, false);
    const publicModelIds = new Set(publicModels.map(item => item.value));
    const fallbackModel = (publicModels.find(item => String(item.badge || '').includes('추천')) || publicModels[0]).value;

    if (pathname === '/api/gemini/status' && request.method === 'GET') {
        const requestedStatusModel = new URL(request.url).searchParams.get('model');
        const statusModel = GEMINI_MODELS.has(requestedStatusModel) && publicModelIds.has(requestedStatusModel) ? requestedStatusModel : fallbackModel;
        let check;
        try {
            check = useKoreaRelay
                ? await fetchThroughKoreaProxy(
                    koreaProxy,
                    `https://generativelanguage.googleapis.com/v1/models/${statusModel}`,
                    'GET',
                    { 'X-goog-api-key': String(env.GEMINI_API_KEY) },
                    undefined,
                    10000,
                )
                : await fetch(`https://generativelanguage.googleapis.com/v1/models/${statusModel}`, {
                    headers: { 'X-goog-api-key': String(env.GEMINI_API_KEY) },
                    signal: AbortSignal.timeout(10000),
                });
        } catch (error) {
            const detail = String(error?.message || error || '네트워크 오류').slice(0, 300);
            return jsonResponse({ status: 'error', configured: true, connected: false, route: routeMode, message: `AI API 연결 확인 실패: ${detail}` }, 502);
        }
        if (!check.ok) {
            const raw = await check.text();
            let detail = '';
            try {
                const failure = JSON.parse(raw);
                detail = failure?.error?.message || failure?.message || '';
            } catch (_) {
                detail = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            const message = detail ? `AI API 연결 확인 실패: ${detail.slice(0, 300)}` : `AI API 연결 확인 실패 (HTTP ${check.status})`;
            return jsonResponse({ status: 'error', configured: true, connected: false, route: routeMode, message }, 502);
        }
        return jsonResponse({ status: 'success', configured: true, connected: true, route: routeMode, model: statusModel });
    }

    const backgroundCancelMatch = pathname.match(/^\/api\/gemini\/interactions\/([^/]+)\/cancel$/);
    if (backgroundCancelMatch && request.method === 'POST') {
        const interactionId = decodeURIComponent(backgroundCancelMatch[1] || '');
        if (!/^[-_A-Za-z0-9]+$/.test(interactionId)) {
            return jsonResponse({ status: 'error', message: '올바르지 않은 AI 작업 ID입니다.' }, 400);
        }
        const job = await env.AUTH_DB.prepare(
            'SELECT id, status, credit_reserved, credit_refunded FROM ai_background_jobs WHERE id=? AND user_id=?',
        ).bind(interactionId, user.id).first();
        if (!job) return jsonResponse({ status: 'error', message: 'AI 작업을 찾을 수 없거나 취소 권한이 없습니다.' }, 404);

        const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'canceled', 'incomplete', 'budget_exceeded', 'timed_out']);
        let cancelData = { id: interactionId, status: String(job.status || 'cancelled') };
        if (!terminalStatuses.has(String(job.status || '').toLowerCase())) {
            let cancelResponse;
            try {
                const targetUrl = `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(interactionId)}/cancel`;
                cancelResponse = useKoreaRelay
                    ? await fetchThroughKoreaProxy(
                        koreaProxy,
                        targetUrl,
                        'POST',
                        { 'X-goog-api-key': String(env.GEMINI_API_KEY), 'Api-Revision': '2026-05-20' },
                        undefined,
                        20000,
                    )
                    : await fetch(targetUrl, {
                        method: 'POST',
                        headers: { 'X-goog-api-key': String(env.GEMINI_API_KEY), 'Api-Revision': '2026-05-20' },
                        signal: AbortSignal.timeout(20000),
                    });
            } catch (error) {
                return jsonResponse({ status: 'error', error: { message: describeAiServerError(error, routeMode) } }, 502, 'no-store');
            }
            const cancelText = await cancelResponse.text();
            try { cancelData = JSON.parse(cancelText); } catch (_) { cancelData = {}; }
            if (!cancelResponse.ok) {
                return new Response(cancelText || JSON.stringify({ error: { message: `AI 작업 취소 HTTP ${cancelResponse.status}` } }), {
                    status: cancelResponse.status,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
                });
            }
        }

        const finalStatus = String(cancelData?.status || 'cancelled').toLowerCase();
        const now = new Date().toISOString();
        await env.AUTH_DB.prepare('UPDATE ai_background_jobs SET status=?, updated_at=? WHERE id=? AND user_id=?')
            .bind(finalStatus, now, interactionId, user.id).run();
        if (finalStatus !== 'completed' && Number(job.credit_reserved) === 1 && Number(job.credit_refunded) !== 1) {
            const refundClaim = await env.AUTH_DB.prepare(
                'UPDATE ai_background_jobs SET credit_refunded=1, updated_at=? WHERE id=? AND user_id=? AND credit_refunded=0',
            ).bind(now, interactionId, user.id).run();
            if (Number(refundClaim?.meta?.changes || 0) === 1) {
                await env.AUTH_DB.prepare(
                    'UPDATE user_writing_credits SET balance=balance+1, used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=? WHERE user_id=?',
                ).bind(now, user.id).run();
            }
        }
        return jsonResponse({ status: 'success', interaction: { ...cancelData, id: interactionId, status: finalStatus }, route: routeMode }, 200, 'no-store');
    }

    const backgroundInteractionMatch = pathname.match(/^\/api\/gemini\/interactions\/([^/]+)$/);
    if (backgroundInteractionMatch && request.method === 'GET') {
        const interactionId = decodeURIComponent(backgroundInteractionMatch[1] || '');
        if (!/^[-_A-Za-z0-9]+$/.test(interactionId)) {
            return jsonResponse({ status: 'error', message: '올바르지 않은 AI 작업 ID입니다.' }, 400);
        }
        const job = await env.AUTH_DB.prepare(
            'SELECT id, status, credit_reserved, credit_refunded, created_at FROM ai_background_jobs WHERE id=? AND user_id=?',
        ).bind(interactionId, user.id).first();
        if (!job) return jsonResponse({ status: 'error', message: 'AI 작업을 찾을 수 없거나 조회 권한이 없습니다.' }, 404);

        let check;
        try {
            const targetUrl = `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(interactionId)}`;
            check = useKoreaRelay
                ? await fetchThroughKoreaProxy(
                    koreaProxy,
                    targetUrl,
                    'GET',
                    { 'X-goog-api-key': String(env.GEMINI_API_KEY), 'Api-Revision': '2026-05-20' },
                    undefined,
                    20000,
                )
                : await fetch(targetUrl, {
                    headers: { 'X-goog-api-key': String(env.GEMINI_API_KEY), 'Api-Revision': '2026-05-20' },
                    signal: AbortSignal.timeout(20000),
                });
        } catch (error) {
            return jsonResponse({
                status: 'error',
                error: { message: describeAiServerError(error, routeMode) },
                route: routeMode,
            }, 502, 'no-store');
        }

        let responseBody = await check.text();
        let responseData = null;
        try { responseData = JSON.parse(responseBody); } catch (_) { /* 원문 오류 응답 유지 */ }
        const interactionStatus = String(responseData?.status || (check.ok ? 'in_progress' : 'failed'));
        const now = new Date().toISOString();

        if (check.ok && ['in_progress', 'queued'].includes(interactionStatus.toLowerCase())) {
            const createdAtMs = Date.parse(String(job.created_at || ''));
            if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs >= BACKGROUND_AI_MAX_WAIT_MS) {
                const cancelPath = `/api/gemini/interactions/${encodeURIComponent(interactionId)}/cancel`;
                try {
                    const cancelUrl = new URL(cancelPath, request.url);
                    await handleGeminiProxy(new Request(cancelUrl, {
                        method: 'POST',
                        headers: request.headers,
                    }), env, cancelPath);
                } catch (cancelError) {
                    console.error(`[AI API] timed-out background cancellation failed (${interactionId})`, cancelError?.message || cancelError);
                }
                return jsonResponse({
                    status: 'failed',
                    id: interactionId,
                    error: { message: '최고급 모델의 글쓰기 시간이 5분을 초과하여 작업을 중단했습니다. 잠시 후 다시 시도하거나 다른 모델을 선택해 주세요.' },
                }, 200, 'no-store');
            }
        }
        await env.AUTH_DB.prepare('UPDATE ai_background_jobs SET status=?, updated_at=? WHERE id=? AND user_id=?')
            .bind(interactionStatus, now, interactionId, user.id).run();

        if ((!check.ok || interactionStatus === 'failed') && Number(job.credit_reserved) === 1 && Number(job.credit_refunded) !== 1) {
            const refundClaim = await env.AUTH_DB.prepare(
                'UPDATE ai_background_jobs SET credit_refunded=1, updated_at=? WHERE id=? AND user_id=? AND credit_refunded=0',
            ).bind(now, interactionId, user.id).run();
            if (Number(refundClaim?.meta?.changes || 0) === 1) {
                await env.AUTH_DB.prepare(
                    'UPDATE user_writing_credits SET balance=balance+1, used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=? WHERE user_id=?',
                ).bind(now, user.id).run();
            }
        }

        if (check.ok && user.role !== 'admin' && responseData) {
            delete responseData.usage;
            delete responseData.usageMetadata;
            delete responseData.usage_metadata;
            responseBody = JSON.stringify(responseData);
        }
        return new Response(responseBody, {
            status: check.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-AI-Route': routeMode },
        });
    }

    if (pathname !== '/api/gemini/interactions' || request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: '지원하지 않는 AI API 요청입니다.' }, 404);
    }
    const unlimitedWriting = ['premium', 'operator', 'admin'].includes(user.role);
    const payload = await request.json().catch(() => ({}));
    const model = GEMINI_MODELS.has(payload.model) && publicModelIds.has(payload.model) ? payload.model : fallbackModel;
    const useBackgroundExecution = BACKGROUND_AI_MODELS.has(model);
    const input = String(payload.input || '').slice(0, 60000);
    let systemInstruction = String(payload.system_instruction || '').slice(0, 60000);
    const revisionInstruction = String(payload.revision_instruction || '').trim().slice(0, 4000);
    const instructionParts = payload.instruction_parts;
    if (instructionParts && typeof instructionParts === 'object' && !Array.isArray(instructionParts)) {
        const enabledSections = await hasFeature(env, user, 'ai.personalize')
            ? await getUserAiInstructionSections(env, user.id)
            : DEFAULT_AI_INSTRUCTION_SECTIONS;
        systemInstruction = ['absolute', 'selected', 'persona', 'conflict']
            .filter(key => enabledSections[key])
            .map(key => String(instructionParts[key] || '').trim().slice(0, 30000))
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 60000);
    }
    if (revisionInstruction) {
        systemInstruction = [systemInstruction.slice(0, 56000), revisionInstruction]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 60000);
    }
    if (!input) return jsonResponse({ status: 'error', message: 'AI 요청 내용이 비어 있습니다.' }, 400);
    let creditReserved = false;
    if (!unlimitedWriting) {
        const reservation = await env.AUTH_DB.prepare(
            'UPDATE user_writing_credits SET balance=balance-1, used_total=used_total+1, updated_at=? WHERE user_id=? AND balance>0',
        ).bind(new Date().toISOString(), user.id).run();
        if (Number(reservation?.meta?.changes || 0) !== 1) {
            return jsonResponse({ status: 'error', code: 'AI_CREDIT_REQUIRED', message: 'AI 글쓰기 쿠폰이 없습니다. 쿠폰을 충전하거나 이용권을 확인해 주세요.' }, 402);
        }
        creditReserved = true;
    }

    // thinking_level과 background 실행은 현재 v1beta + Api-Revision 조합으로 호출한다.
    // v1 경로는 thinking_level 요청을 400으로 거부한다.
    let upstream;
    try {
        const upstreamPayload = {
            model,
            input,
            // low는 현재 제공하는 모든 텍스트 모델이 공통으로 지원한다.
            // minimal은 일부 Pro/최신 Flash 모델에서 400 오류를 발생시킨다.
            generation_config: { max_output_tokens: 8192, thinking_level: 'low' },
            // 프리미엄 모델은 생성 시간이 Cloudflare origin read timeout을 넘길 수 있어
            // 즉시 작업 ID를 받는 백그라운드 실행으로 전환한다.
            store: useBackgroundExecution,
        };
        if (useBackgroundExecution) upstreamPayload.background = true;
        if (systemInstruction) upstreamPayload.system_instruction = systemInstruction;
        upstream = useKoreaRelay
            ? await fetchThroughKoreaProxy(
                koreaProxy,
                'https://generativelanguage.googleapis.com/v1beta/interactions',
                'POST',
                { 'Content-Type': 'application/json', 'X-goog-api-key': String(env.GEMINI_API_KEY), 'Api-Revision': '2026-05-20' },
                upstreamPayload,
                180000,
            )
            : await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-goog-api-key': String(env.GEMINI_API_KEY), 'Api-Revision': '2026-05-20' },
                body: JSON.stringify(upstreamPayload),
                signal: AbortSignal.timeout(180000),
            });
    } catch (error) {
        if (creditReserved) {
            try {
                await env.AUTH_DB.prepare(
                    'UPDATE user_writing_credits SET balance=balance+1, used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=? WHERE user_id=?',
                ).bind(new Date().toISOString(), user.id).run();
            } catch (refundError) {
                console.error('[AI API] writing credit refund failed', refundError?.message || refundError);
            }
        }
        const requestId = crypto.randomUUID();
        console.error(`[AI API] upstream request failed (${requestId}, route=${routeMode})`, error?.message || error);
        return jsonResponse({
            status: 'error',
            error: { message: `${describeAiServerError(error, routeMode)} · 오류 ID ${requestId}` },
            route: routeMode,
        }, 502, 'no-store');
    }
    let responseBody = await upstream.text();
    if (!upstream.ok && creditReserved) {
        await env.AUTH_DB.prepare(
            'UPDATE user_writing_credits SET balance=balance+1, used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=? WHERE user_id=?',
        ).bind(new Date().toISOString(), user.id).run();
    }
    if (upstream.ok && useBackgroundExecution) {
        try {
            const backgroundData = JSON.parse(responseBody);
            const interactionId = String(backgroundData?.id || '');
            if (!interactionId) throw new Error('AI 백그라운드 작업 ID가 없습니다.');
            const now = new Date().toISOString();
            await env.AUTH_DB.prepare(
                `INSERT OR REPLACE INTO ai_background_jobs
                 (id,user_id,model,status,credit_reserved,credit_refunded,created_at,updated_at)
                 VALUES (?,?,?,?,?,?,?,?)`,
            ).bind(
                interactionId,
                user.id,
                model,
                String(backgroundData.status || 'in_progress'),
                creditReserved ? 1 : 0,
                0,
                now,
                now,
            ).run();
        } catch (error) {
            if (creditReserved) {
                await env.AUTH_DB.prepare(
                    'UPDATE user_writing_credits SET balance=balance+1, used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=? WHERE user_id=?',
                ).bind(new Date().toISOString(), user.id).run();
            }
            console.error('[AI API] background job registration failed', error?.message || error);
            return jsonResponse({ status: 'error', error: { message: '최고급 AI 모델 작업을 등록하지 못했습니다.' } }, 502, 'no-store');
        }
    }
    if (upstream.ok && user.role !== 'admin') {
        try {
            const responseData = JSON.parse(responseBody);
            delete responseData.usage;
            delete responseData.usageMetadata;
            delete responseData.usage_metadata;
            if (responseData.interaction && typeof responseData.interaction === 'object') {
                delete responseData.interaction.usage;
                delete responseData.interaction.usageMetadata;
                delete responseData.interaction.usage_metadata;
            }
            responseBody = JSON.stringify(responseData);
        } catch (_) {
            // JSON이 아닌 오류 응답은 원문을 유지합니다.
        }
    }
    return new Response(responseBody, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-AI-Route': routeMode },
    });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/api/build-info') {
            return jsonResponse({ status: 'success', worker_build: WORKER_BUILD_ID }, 200, 'no-store');
        }
        if (url.pathname === '/api/ai-models' && request.method === 'GET') {
            const models = await getAiModelCatalog(env, false);
            const recommended = models.find(item => String(item.badge || '').includes('추천')) || models[0];
            return jsonResponse({ status: 'success', models, fallback: recommended.value }, 200, 'public, max-age=60');
        }
        const ingestResponse = await ingestTrafficData(request, env, url.pathname);
        if (ingestResponse) return ingestResponse;
        if (url.pathname === '/api/data/status' && request.method === 'GET') return trafficDataStatus(env);
        const trafficDataResponse = await serveTrafficData(request, env, url.pathname, ctx);
        if (trafficDataResponse) return trafficDataResponse;
        if (url.pathname.startsWith('/api/auth/')) return handleAuthRequest(request, env, url.pathname);
        if (url.pathname.startsWith('/api/admin/')) return handleAdminRequest(request, env, url.pathname);
        if (url.pathname.startsWith('/api/gemini/')) {
            try {
                return await handleGeminiProxy(request, env, url.pathname);
            } catch (error) {
                const requestId = crypto.randomUUID();
                console.error(`[AI API] unhandled worker error (${requestId}, path=${url.pathname})`, error?.message || error);
                return jsonResponse({
                    status: 'error',
                    error: { message: `${describeAiServerError(error)} · 오류 ID ${requestId}` },
                }, 500, 'no-store');
            }
        }
        if (url.pathname === '/api/news_search' || url.pathname === '/api/google_search') {
            return handleCombinedNewsSearch(request, env);
        }
        if (url.pathname === '/api/naver_news_search') return handleNaverNewsSearch(request, env);
        if (url.pathname === '/api/naver_search_trend') return handleNaverSearchTrend(request, env);

        if (request.method === 'GET' && (url.pathname === '/studio' || url.pathname === '/studio/')) {
            const studioAssetUrl = new URL('/', url);
            const studioRequest = new Request(studioAssetUrl, request);
            const studioResponse = await env.ASSETS.fetch(studioRequest);
            const headers = new Headers(studioResponse.headers);
            headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            headers.set('CDN-Cache-Control', 'no-store');
            return new Response(studioResponse.body, { status: studioResponse.status, headers });
        }

        if (request.method === 'GET' && ['/admin', '/admin/', '/admin.html'].includes(url.pathname)) {
            let user;
            try { user = await getAuthenticatedUser(request, env); } catch (_) { user = null; }
            if (!user || user.role !== 'admin') return new Response('Not Found', { status: 404 });
            const adminRequest = new Request(new URL('/admin', url), request);
            const adminResponse = await env.ASSETS.fetch(adminRequest);
            const headers = new Headers(adminResponse.headers);
            headers.set('Cache-Control', 'no-store');
            return new Response(adminResponse.body, { status: adminResponse.status, headers });
        }

        const assetResponse = await env.ASSETS.fetch(request);
        const isHtmlDocument = request.method === 'GET'
            && (url.pathname === '/' || url.pathname.endsWith('.html'));
        if (!isHtmlDocument) return assetResponse;

        const headers = new Headers(assetResponse.headers);
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        headers.set('CDN-Cache-Control', 'no-store');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
        return new Response(assetResponse.body, {
            status: assetResponse.status,
            statusText: assetResponse.statusText,
            headers,
        });
    },
};
