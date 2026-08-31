import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { handleAuthRequest } from '../cloud_auth.js';
import { normalizeDraftBundle, readDraftBundle } from '../static/draft-bundle.mjs';

const cuts = Array.from({ length: 4 }, (_, i) => ({ cut: i + 1, time: '0~5초', role: '장면', conceptKo: '한글 콘셉트', promptEn: 'A "quoted" scene <img src=x onerror=alert(1)>' }));
const bundle = { version: 1, article_mode: 'story', keyword: '테스트', illustration_storyboard: cuts, shorts_storyboard: cuts, story_input: { title: '제목', content: '내 메모', request: '따뜻하게', type: '뉴스형' } };

function environment() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync(new URL('../auth_schema.sql', import.meta.url), 'utf8').replace("    bundle_json TEXT NOT NULL DEFAULT '{}',\n", ''));
    const binding = { prepare(sql) {
        let values = [];
        return { bind(...args) { values = args; return this; },
            async first() { return sqlite.prepare(sql).get(...values) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
            async run() { sqlite.prepare(sql).run(...values); return { success: true }; },
            async batchRun() { const s = sqlite.prepare(sql); if (s.columns().length) return { results: s.all(...values) }; s.run(...values); return { success: true }; } };
    }, async batch(statements) { return Promise.all(statements.map(s => s.batchRun())); } };
    const secret = 'test-only-secret-not-a-real-key-123';
    for (const user of ['owner', 'other']) {
        sqlite.prepare("INSERT INTO users(id,email,nickname,created_at,updated_at) VALUES (?,?,?,'2026-01-01','2026-01-01')").run(user, user + '@example.test', user);
        const hash = createHash('sha256').update(`${secret}|session|${user}`).digest('hex');
        sqlite.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,'2099-01-01','2026-01-01','2026-01-01')").run(user, user, hash);
    }
    sqlite.prepare("INSERT INTO user_drafts(id,user_id,title,body_markdown,created_at,updated_at) VALUES ('legacy','owner','이전 글',?,'2026-01-01','2026-01-01')").run('이전 본문 '.repeat(12));
    const env = { AUTH_DB: binding, AUTH_SECRET: secret, PRIMARY_ADMIN_EMAIL: 'none@example.test' };
    async function call(method, path = '/api/auth/drafts', body, user = 'owner') {
        const request = new Request('https://example.test' + path, { method, headers: { Cookie: user ? `tc_session=${user}` : '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        const response = await handleAuthRequest(request, env, path);
        return { status: response.status, data: await response.json() };
    }
    return { sqlite, call };
}

test('Worker: old schema migration, both boards roundtrip, summary and rename', async () => {
    const { sqlite, call } = environment();
    try {
        const legacy = await call('GET', '/api/auth/drafts/legacy');
        assert.equal(legacy.status, 200);
        assert.equal(legacy.data.draft.bundle.version, 0);
        assert.ok(sqlite.prepare('PRAGMA table_info(user_drafts)').all().some(c => c.name === 'bundle_json'));
        const payload = { title: '새 글', body_markdown: '본문 '.repeat(30), bundle };
        const saved = await call('POST', undefined, payload);
        assert.equal(saved.status, 200);
        assert.equal(saved.data.count, 2);
        const id = saved.data.draft.id;
        const detail = await call('GET', '/api/auth/drafts/' + id);
        assert.deepEqual(detail.data.draft.bundle, bundle);
        const list = await call('GET');
        assert.equal(list.data.drafts.find(d => d.id === id).illustration_count, 4);
        assert.ok(list.data.drafts.every(d => !('bundle_json' in d) && !('bundle' in d)));
        const renamed = await call('POST', undefined, { title: '수정 제목', body_markdown: payload.body_markdown, draft_id: id });
        assert.equal(renamed.data.count, 2);
        assert.deepEqual((await call('GET', '/api/auth/drafts/' + id)).data.draft.bundle, bundle);
        for (const method of ['GET', 'DELETE']) assert.equal((await call(method, '/api/auth/drafts/' + id, undefined, 'other')).status, 404);
        assert.equal((await call('POST', undefined, { ...payload, draft_id: id }, 'other')).status, 404);
        assert.equal((await call('POST', undefined, payload, '')).status, 401);
        assert.equal((await call('POST', undefined, { ...payload, bundle: { ...bundle, shorts_storyboard: [...cuts, cuts[0]] } })).status, 400);
        const keyword = { ...bundle, article_mode: 'keyword', story_input: {}, shorts_storyboard: [], illustration_storyboard: [] };
        assert.equal((await call('POST', undefined, { ...payload, draft_id: id, bundle: keyword })).status, 200);
        assert.deepEqual((await call('GET', '/api/auth/drafts/' + id)).data.draft.bundle, keyword);
    } finally { sqlite.close(); }
});

test('bundle validation: legacy, bad shapes and oversized prompts', () => {
    assert.equal(readDraftBundle('{bad json').version, 0);
    assert.equal(readDraftBundle('{}').shorts_storyboard.length, 0);
    assert.throws(() => normalizeDraftBundle({ ...bundle, keyword: 'x'.repeat(501) }));
    assert.throws(() => normalizeDraftBundle({ ...bundle, story_input: [] }));
    assert.throws(() => normalizeDraftBundle({ ...bundle, shorts_storyboard: [{ promptEn: 'x'.repeat(6001) }] }));
});

test('all inline application scripts still parse', () => {
    for (const file of ['index.html', 'templates/index.html']) {
        const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
            if (/src=|application\/ld\+json|type="module"/.test(match[1])) continue;
            new vm.Script(match[2], { filename: file });
        }
    }
});

const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
for (const file of ['index.html', 'templates/index.html']) {
    const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    const resume = html.slice(html.indexOf('async function resumeSavedDraft(draft)'), html.indexOf('async function loadNaverDrafts()'))
        .replace("await import('/static/draft-bundle.mjs?v=20260831-1')", 'await loadDraftBundle()');
    test(file + ': restore exact boards and mode, preserve the other mode and allow cancellation', async () => {
        const element = () => ({ value: '' });
        const ctx = { writingModelLocked: false, saveCurrentDraftPending: false, btnAddArticleContent: { disabled: false },
            verifyAIWritingSession: async () => true, loadDraftBundle: async () => ({ readDraftBundle }),
            activeWritingMode: 'keyword', generatedDataByMode: { keyword: { marker: 'keep this' }, story: null },
            storyTitleInput: element(), storyContentInput: element(), storyRequestInput: element(), storyTypeSelect: element(), aiCustomInput: element(),
            saveStoryDraft() {}, updateStoryCharCount() {}, saveRecentArticleCache() {}, closeNaverDraftsModal() {},
            showToastNotification() {}, escapeHtml, convertMarkdownToHtml: s => s,
            document: { querySelector: () => ({ click() {} }) }, window: { showConfirmDialog: async () => true } };
        ctx.rememberGeneratedData = (data, mode) => { ctx.generatedDataByMode[mode] = data; };
        ctx.setWritingMode = mode => { ctx.activeWritingMode = mode; };
        vm.createContext(ctx);
        vm.runInContext(resume, ctx);
        const draft = { id: 'saved', title: '제목', body_markdown: '# 글 <img src=x onerror=alert(1)>', bundle, source_urls: ['https://example.test/news'] };
        await ctx.resumeSavedDraft(draft);
        assert.equal(ctx.activeWritingMode, 'story');
        assert.equal(ctx.generatedDataByMode.keyword.marker, 'keep this');
        assert.equal(ctx.storyContentInput.value, bundle.story_input.content);
        assert.deepEqual(JSON.parse(JSON.stringify(ctx.generatedDataByMode.story.shortsStoryboard)), cuts);
        assert.ok(!ctx.generatedDataByMode.story.blogPostHtml.includes('<img'));
        assert.equal(ctx.generatedDataByMode.story.draftId, 'saved');
        ctx.window.showConfirmDialog = async () => false;
        await ctx.resumeSavedDraft({ ...draft, id: 'cancelled' });
        assert.equal(ctx.generatedDataByMode.story.draftId, 'saved');
        ctx.window.showConfirmDialog = async () => true;
        await ctx.resumeSavedDraft({ ...draft, id: 'keyword', bundle: { ...bundle, article_mode: 'keyword', story_input: {} } });
        assert.equal(ctx.activeWritingMode, 'keyword');
        assert.equal(ctx.generatedDataByMode.story.draftId, 'saved');
        await ctx.resumeSavedDraft({ ...draft, id: 'legacy', bundle: undefined });
        assert.equal(ctx.activeWritingMode, 'keyword');
        assert.equal(ctx.generatedDataByMode.keyword.shortsStoryboard.length, 0);
    });
    test(file + ': restored cards escape prompt markup and legacy drafts never generate fallback cards', () => {
        const area = () => ({ innerHTML: '', children: [], appendChild(card) { this.children.push(card); }, querySelectorAll: () => [] });
        const ctx = { currentGeneratedData: { restoredFromDraft: true, keyword: '제목' }, aiCustomInput: { value: '' }, selectedArticleContext: {},
            shortsContentArea: area(), illustrationsContentArea: area(), escapeHtml,
            document: { createElement: () => ({}) }, buildFallbackShortsStoryboard() { throw new Error('unexpected fallback'); }, buildFallbackIllustrationStoryboard() { throw new Error('unexpected fallback'); } };
        vm.createContext(ctx);
        vm.runInContext(html.slice(html.indexOf('function renderShortsCards(storyboard)'), html.indexOf('function buildShortsMarkdown(storyboard)')), ctx);
        ctx.renderShortsCards(cuts);
        ctx.renderIllustrationCards(cuts);
        assert.equal(ctx.shortsContentArea.children.length, 4);
        assert.equal(ctx.illustrationsContentArea.children.length, 4);
        assert.ok(!ctx.shortsContentArea.children[0].innerHTML.includes('<img'));
        ctx.renderShortsCards([]);
        ctx.renderIllustrationCards([]);
        assert.match(ctx.shortsContentArea.innerHTML, /저장된 쇼츠 프롬프트가 없습니다/);
        assert.match(ctx.illustrationsContentArea.innerHTML, /저장된 삽화 프롬프트가 없습니다/);
    });
}
