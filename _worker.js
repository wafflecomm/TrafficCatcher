const GOOGLE_NEWS_RSS_ENDPOINTS = [
    'https://news.google.co.kr/rss/search',
    'https://news.google.com/rss/search',
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

async function handleGoogleSearch(request) {
    if (request.method !== 'POST') {
        return jsonResponse({ status: 'error', message: 'POST 요청만 지원합니다.', items: [] }, 405);
    }

    try {
        const payload = await request.json();
        const keyword = String(payload?.keyword || '').trim().slice(0, 120);
        if (!keyword) return jsonResponse({ status: 'error', message: '검색 키워드가 없습니다.', items: [] }, 400);

        let items = [];
        let lastStatus = 502;
        for (const query of [keyword, `${keyword} when:7d`]) {
            for (const endpoint of GOOGLE_NEWS_RSS_ENDPOINTS) {
                const rssUrl = new URL(endpoint);
                rssUrl.searchParams.set('q', query);
                rssUrl.searchParams.set('hl', 'ko');
                rssUrl.searchParams.set('gl', 'KR');
                rssUrl.searchParams.set('ceid', 'KR:ko');

                try {
                    const response = await fetch(rssUrl, {
                        headers: {
                            'Accept': 'application/rss+xml, application/xml, text/xml',
                            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
                            'User-Agent': 'Mozilla/5.0 (compatible; TrafficCatcher/1.0; +https://trafficcatcher.pages.dev)',
                        },
                        signal: AbortSignal.timeout(8000),
                        cf: { cacheTtl: 300, cacheEverything: true },
                    });
                    lastStatus = response.status;
                    if (!response.ok) continue;
                    items = parseGoogleNewsRss(await response.text());
                    if (items.length) break;
                } catch (_) {
                    lastStatus = 504;
                }
            }
            if (items.length) break;
        }
        if (!items.length && lastStatus >= 400) throw new Error(`Google News RSS HTTP ${lastStatus}`);

        return jsonResponse(
            { status: items.length ? 'success' : 'empty', items },
            200,
            'public, max-age=120',
        );
    } catch (error) {
        return jsonResponse(
            { status: 'error', message: error?.message || 'Google News RSS 수집 실패', items: [] },
            502,
        );
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/api/google_search') return handleGoogleSearch(request);
        return env.ASSETS.fetch(request);
    },
};
