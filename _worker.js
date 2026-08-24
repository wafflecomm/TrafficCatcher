import { getAuthenticatedUser, handleAuthRequest } from './cloud_auth.js';

const GOOGLE_NEWS_RSS_ENDPOINTS = [
    'https://news.google.com/rss/search',
    'https://news.google.co.kr/rss/search',
];

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

function readTag(block, tagName) {
    const match = block.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
    return match ? decodeXml(match[1]) : '';
}

function stripHtml(value = '') {
    return decodeXml(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseGoogleNewsRss(xmlText) {
    return [...xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        .slice(0, 3)
        .map((match) => {
            const block = match[1];
            const title = readTag(block, 'title');
            const url = readTag(block, 'link');
            const press = readTag(block, 'source') || 'Google News';
            const description = stripHtml(readTag(block, 'description'));
            return {
                title,
                url,
                press,
                channel: press,
                content: description ? `[${press} 보도 내용]\n${description}` : `[${press}] ${title}`,
                transcript: description ? `[${press} 보도 내용]\n${description}` : `[${press}] ${title}`,
            };
        })
        .filter((item) => item.title && /^https:\/\//i.test(item.url));
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

async function fetchGoogleNewsEndpoint(endpoint, query, diagnostics) {
    const rssUrl = new URL(endpoint);
    rssUrl.searchParams.set('q', query);
    rssUrl.searchParams.set('hl', 'ko');
    rssUrl.searchParams.set('gl', 'KR');
    rssUrl.searchParams.set('ceid', 'KR:ko');

    const startedAt = Date.now();
    try {
        const response = await fetch(rssUrl, {
            headers: {
                'Accept': 'application/rss+xml, application/xml, text/xml',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
                'User-Agent': 'Mozilla/5.0 (compatible; TrafficCatcher/1.0; +https://trafficcatcher.pages.dev)',
            },
            signal: AbortSignal.timeout(5000),
            cf: { cacheTtl: 600, cacheEverything: true },
        });
        const elapsedMs = Date.now() - startedAt;
        if (!response.ok) {
            diagnostics.push({ endpoint, query, status: response.status, elapsedMs });
            throw new Error(`HTTP ${response.status}`);
        }

        const items = parseGoogleNewsRss(await response.text());
        diagnostics.push({ endpoint, query, status: items.length ? 200 : 204, elapsedMs, count: items.length });
        if (!items.length) throw new Error('empty');
        return { items, endpoint, elapsedMs };
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        if (!diagnostics.some((item) => item.endpoint === endpoint && item.query === query)) {
            diagnostics.push({
                endpoint,
                query,
                status: error?.name === 'TimeoutError' ? 504 : 502,
                elapsedMs,
                message: error?.message || 'fetch failed',
            });
        }
        throw error;
    }
}

async function searchGoogleNewsInParallel(query, diagnostics) {
    try {
        return await Promise.any(
            GOOGLE_NEWS_RSS_ENDPOINTS.map((endpoint) => fetchGoogleNewsEndpoint(endpoint, query, diagnostics)),
        );
    } catch (_) {
        return null;
    }
}

async function handleGoogleSearch(request) {
    if (request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: 'POST 요청만 지원합니다.', items: [] }, 405);
    }

    try {
        const payload = await request.json();
        const keyword = String(payload?.keyword || '').trim().slice(0, 120);
        if (!keyword) return jsonResponse({ status: 'error', message: '검색 키워드가 없습니다.', items: [] }, 400);

        const diagnostics = [];
        let result = await searchGoogleNewsInParallel(keyword, diagnostics);
        if (!result) result = await searchGoogleNewsInParallel(`${keyword} when:7d`, diagnostics);

        if (!result?.items?.length) {
            return jsonResponse({
                status: 'error',
                message: 'Google News RSS 병렬 검색에 실패했습니다.',
                items: [],
                diagnostics,
            }, 502);
        }

        return jsonResponse({
            status: 'success',
            items: result.items,
            sourceEndpoint: result.endpoint,
            elapsedMs: result.elapsedMs,
            diagnostics,
        }, 200, 'public, max-age=300');
    } catch (error) {
        return jsonResponse(
            { status: 'error', message: error?.message || 'Google News RSS 수집 실패', items: [] },
            502,
        );
    }
}

const GEMINI_MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-3.6-flash']);

async function handleGeminiProxy(request, env, pathname) {
    if (!env.GEMINI_API_KEY) {
        return jsonResponse({ status: 'error', configured: false, message: 'Cloudflare Secret GEMINI_API_KEY가 설정되지 않았습니다.' }, 503);
    }
    let user;
    try { user = await getAuthenticatedUser(request, env); }
    catch (error) { return jsonResponse({ status: 'error', message: error.message }, 503); }
    if (!user) return jsonResponse({ status: 'error', message: '로그인이 필요합니다.' }, 401);

    if (pathname === '/api/gemini/status' && request.method === 'GET') {
        const check = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite', {
            headers: { 'X-goog-api-key': String(env.GEMINI_API_KEY) },
        });
        if (!check.ok) {
            return jsonResponse({ status: 'error', configured: true, connected: false, message: `Gemini API 키 검증 실패 (HTTP ${check.status})` }, 502);
        }
        return jsonResponse({ status: 'success', configured: true, connected: true });
    }
    if (pathname !== '/api/gemini/interactions' || request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: '지원하지 않는 Gemini API 요청입니다.' }, 404);
    }
    const payload = await request.json().catch(() => ({}));
    const model = GEMINI_MODELS.has(payload.model) ? payload.model : 'gemini-3.5-flash-lite';
    const input = String(payload.input || '').slice(0, 60000);
    const systemInstruction = String(payload.system_instruction || '').slice(0, 60000);
    if (!input || !systemInstruction) return jsonResponse({ status: 'error', message: 'AI 요청 내용이 비어 있습니다.' }, 400);

    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': String(env.GEMINI_API_KEY) },
        body: JSON.stringify({
            model,
            input,
            system_instruction: systemInstruction,
            generation_config: { max_output_tokens: 8192, thinking_level: 'minimal' },
            store: false,
        }),
    });
    const responseBody = await upstream.text();
    return new Response(responseBody, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/auth/')) return handleAuthRequest(request, env, url.pathname);
        if (url.pathname.startsWith('/api/gemini/')) return handleGeminiProxy(request, env, url.pathname);
        if (url.pathname === '/api/google_search') return handleGoogleSearch(request);

        if (request.method === 'GET' && (url.pathname === '/studio' || url.pathname === '/studio/')) {
            const studioAssetUrl = new URL('/index.html', url);
            const studioRequest = new Request(studioAssetUrl, request);
            const studioResponse = await env.ASSETS.fetch(studioRequest);
            const headers = new Headers(studioResponse.headers);
            headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            headers.set('CDN-Cache-Control', 'no-store');
            return new Response(studioResponse.body, { status: studioResponse.status, headers });
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
