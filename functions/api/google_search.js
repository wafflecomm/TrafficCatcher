const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search';

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

export async function onRequestPost(context) {
    try {
        const payload = await context.request.json();
        const keyword = String(payload?.keyword || '').trim().slice(0, 120);
        if (!keyword) {
            return Response.json({ status: 'error', message: '검색 키워드가 없습니다.', items: [] }, { status: 400 });
        }

        const rssUrl = new URL(GOOGLE_NEWS_RSS);
        rssUrl.searchParams.set('q', keyword);
        rssUrl.searchParams.set('hl', 'ko');
        rssUrl.searchParams.set('gl', 'KR');
        rssUrl.searchParams.set('ceid', 'KR:ko');

        const response = await fetch(rssUrl, {
            headers: {
                'Accept': 'application/rss+xml, application/xml, text/xml',
                'User-Agent': 'TrafficCatcher/1.0 (+https://trafficcatcher.pages.dev)',
            },
            cf: { cacheTtl: 300, cacheEverything: true },
        });
        if (!response.ok) throw new Error(`Google News RSS HTTP ${response.status}`);

        const items = parseGoogleNewsRss(await response.text());
        return Response.json(
            { status: items.length ? 'success' : 'empty', items },
            { headers: { 'Cache-Control': 'public, max-age=120' } },
        );
    } catch (error) {
        return Response.json(
            { status: 'error', message: error?.message || 'Google News RSS 수집 실패', items: [] },
            { status: 502 },
        );
    }
}
