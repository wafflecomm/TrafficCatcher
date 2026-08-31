// Versioned draft metadata shared by the Worker and browser (no credentials or HTML).
export const EMPTY_DRAFT_BUNDLE = Object.freeze({ version: 0, article_mode: null, keyword: '', illustration_storyboard: [], shorts_storyboard: [], story_input: {} });

export function normalizeDraftBundle(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw new Error('지원하지 않는 글서랍 저장 형식입니다.');
    if (!['keyword', 'story'].includes(value.article_mode)) throw new Error('글쓰기 유형이 올바르지 않습니다.');
    const string = (value, max) => {
        if (value == null) return '';
        if (typeof value !== 'string' || [...value].length > max) throw new Error('저장할 프롬프트 또는 입력 내용이 허용 길이를 초과했습니다.');
        return value;
    };
    const board = value => {
        if (value == null) return [];
        if (!Array.isArray(value) || value.length > 4) throw new Error('스토리보드는 최대 4컷까지 저장할 수 있습니다.');
        return value.map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('4컷 데이터 형식이 올바르지 않습니다.');
            return { cut: index + 1, time: string(item.time, 100), role: string(item.role, 200), conceptKo: string(item.conceptKo, 4000), promptEn: string(item.promptEn, 6000) };
        });
    };
    const input = value.story_input || {};
    if (typeof input !== 'object' || Array.isArray(input)) throw new Error('메모 입력 형식이 올바르지 않습니다.');
    const result = { version: 1, article_mode: value.article_mode, keyword: string(value.keyword, 500),
        illustration_storyboard: board(value.illustration_storyboard), shorts_storyboard: board(value.shorts_storyboard),
        story_input: value.article_mode === 'story' ? { title: string(input.title, 300), content: string(input.content, 50000), request: string(input.request, 10000), type: string(input.type, 100) } : {} };
    if (new TextEncoder().encode(JSON.stringify(result)).length > 200000) throw new Error('프롬프트와 메모의 저장 용량은 200KB 이내여야 합니다.');
    return result;
}

export function readDraftBundle(json) {
    try { return normalizeDraftBundle(typeof json === 'string' ? JSON.parse(json) : json); }
    catch (_) { return { ...EMPTY_DRAFT_BUNDLE, illustration_storyboard: [], shorts_storyboard: [], story_input: {} }; }
}

export function draftBundleSummary(json) {
    const bundle = readDraftBundle(json);
    return { article_mode: bundle.article_mode, illustration_count: bundle.illustration_storyboard.length, shorts_count: bundle.shorts_storyboard.length };
}
