import { getAuthenticatedUser, handleAdminRequest, handleAuthRequest } from './cloud_auth.js';

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

async function handleNaverNewsSearch(request, env) {
    if (request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: 'POST 요청만 지원합니다.', items: [] }, 405);
    }

    if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
        return jsonResponse({ status: 'error', message: 'Cloudflare Secret NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.', items: [] }, 503);
    }
    let user;
    try { user = await getAuthenticatedUser(request, env); }
    catch (error) { return jsonResponse({ status: 'error', message: error.message, items: [] }, 503); }
    if (!user) return jsonResponse({ status: 'error', message: '로그인이 필요합니다.', items: [] }, 401);

    try {
        const payload = await request.json();
        const keyword = String(payload?.keyword || '').trim().slice(0, 120);
        if (!keyword) return jsonResponse({ status: 'error', message: '검색 키워드가 없습니다.', items: [] }, 400);

        const searchUrl = new URL('https://naverapihub.apigw.ntruss.com/search/v1/news');
        searchUrl.searchParams.set('query', keyword);
        searchUrl.searchParams.set('display', '5');
        searchUrl.searchParams.set('start', '1');
        searchUrl.searchParams.set('sort', 'date');
        searchUrl.searchParams.set('format', 'json');
        const startedAt = Date.now();
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
            return jsonResponse({
                status: 'error',
                message: data.errorMessage || data.message || `네이버 뉴스 API HTTP ${upstream.status}`,
                code: data.errorCode || '',
                items: [],
            }, upstream.status >= 500 ? 502 : upstream.status);
        }
        const items = (Array.isArray(data.items) ? data.items : []).slice(0, 5).map((item) => {
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

const GEMINI_MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-3.6-flash']);

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
        const detail = envelope?.message || envelope?.error;
        const message = typeof detail === 'string' ? detail : detail?.message || `한국 서버 프록시 HTTP ${proxyResponse.status}`;
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

    if (pathname === '/api/gemini/status' && request.method === 'GET') {
        const check = useKoreaRelay
            ? await fetchThroughKoreaProxy(
                koreaProxy,
                'https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite',
                'GET',
                { 'X-goog-api-key': String(env.GEMINI_API_KEY) },
                undefined,
                10000,
            )
            : await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite', {
                headers: { 'X-goog-api-key': String(env.GEMINI_API_KEY) },
                signal: AbortSignal.timeout(10000),
            });
        if (!check.ok) {
            return jsonResponse({ status: 'error', configured: true, connected: false, route: routeMode, message: `AI API 연결 확인 실패 (HTTP ${check.status})` }, 502);
        }
        return jsonResponse({ status: 'success', configured: true, connected: true, route: routeMode });
    }
    if (pathname !== '/api/gemini/interactions' || request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: '지원하지 않는 AI API 요청입니다.' }, 404);
    }
    const unlimitedWriting = ['premium', 'operator', 'admin'].includes(user.role);
    const payload = await request.json().catch(() => ({}));
    const model = GEMINI_MODELS.has(payload.model) ? payload.model : 'gemini-3.5-flash-lite';
    const input = String(payload.input || '').slice(0, 60000);
    const systemInstruction = String(payload.system_instruction || '').slice(0, 60000);
    if (!input || !systemInstruction) return jsonResponse({ status: 'error', message: 'AI 요청 내용이 비어 있습니다.' }, 400);
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

    // Interactions API is GA on v1. Using the stable route avoids project/region-specific
    // v1beta availability differences that can surface as an upstream HTTP 404.
    let upstream;
    try {
        const upstreamPayload = {
            model,
            input,
            system_instruction: systemInstruction,
            generation_config: { max_output_tokens: 8192, thinking_level: 'minimal' },
            store: false,
        };
        upstream = useKoreaRelay
            ? await fetchThroughKoreaProxy(
                koreaProxy,
                'https://generativelanguage.googleapis.com/v1/interactions',
                'POST',
                { 'Content-Type': 'application/json', 'X-goog-api-key': String(env.GEMINI_API_KEY) },
                upstreamPayload,
                180000,
            )
            : await fetch('https://generativelanguage.googleapis.com/v1/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-goog-api-key': String(env.GEMINI_API_KEY) },
                body: JSON.stringify(upstreamPayload),
                signal: AbortSignal.timeout(180000),
            });
    } catch (error) {
        if (creditReserved) await env.AUTH_DB.prepare(
            'UPDATE user_writing_credits SET balance=balance+1, used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=? WHERE user_id=?',
        ).bind(new Date().toISOString(), user.id).run();
        throw error;
    }
    let responseBody = await upstream.text();
    if (!upstream.ok && creditReserved) {
        await env.AUTH_DB.prepare(
            'UPDATE user_writing_credits SET balance=balance+1, used_total=CASE WHEN used_total>0 THEN used_total-1 ELSE 0 END, updated_at=? WHERE user_id=?',
        ).bind(new Date().toISOString(), user.id).run();
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
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/auth/')) return handleAuthRequest(request, env, url.pathname);
        if (url.pathname.startsWith('/api/admin/')) return handleAdminRequest(request, env, url.pathname);
        if (url.pathname.startsWith('/api/gemini/')) return handleGeminiProxy(request, env, url.pathname);
        if (url.pathname === '/api/google_search' || url.pathname === '/api/naver_news_search') {
            return handleNaverNewsSearch(request, env);
        }
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
