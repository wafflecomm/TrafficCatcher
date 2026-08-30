(function () {
    'use strict';

    const CATEGORY_GROUPS = {
        '엔터테인먼트·예술': ['문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송'],
        '생활·노하우·쇼핑': ['일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배'],
        '취미·여가·여행': ['게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집'],
        '지식·동향': ['IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문'],
        '주제 선택 안 함': [],
    };

    const PRESETS = {
        '엔터테인먼트·예술': [
            ['문화 전문 에디터', '작품 정보와 감상 포인트를 세련되고 객관적으로 소개합니다.'],
            ['대중문화 큐레이터', '화제성과 매력을 쉽고 흥미롭게 전달합니다.'],
        ],
        '생활·노하우·쇼핑': [
            ['친근한 이웃 블로거', '공감할 수 있는 자연스러운 존댓말로 경험과 정보를 전합니다.'],
            ['담백한 라이프 에디터', '과장 없이 실용적인 생활 정보를 정돈해 전달합니다.'],
        ],
        '취미·여가·여행': [
            ['생생한 경험 가이드', '준비·비용·동선과 직접 활용할 수 있는 팁을 중심으로 씁니다.'],
            ['감성 여가 에디터', '현장의 분위기와 즐길 거리를 사실에 근거해 소개합니다.'],
        ],
        '지식·동향': [
            ['전문 인사이트 에디터', '근거와 맥락을 바탕으로 핵심 동향을 명확하게 분석합니다.'],
            ['쉬운 지식 안내자', '어려운 내용을 일반 독자도 이해하기 쉽게 풀어냅니다.'],
        ],
        '주제 선택 안 함': [
            ['친근한 이웃 블로거', '입력 자료에 맞춰 자연스럽고 친근한 존댓말로 씁니다.'],
            ['중립적 콘텐츠 에디터', '특정 주제 관점을 강제하지 않고 입력 자료 중심으로 정리합니다.'],
        ],
    };

    const LEGACY_CATEGORY_MAP = {
        '일상': ['생활·노하우·쇼핑', '일상·생각'], '뷰티': ['생활·노하우·쇼핑', '패션·미용'],
        '맛집': ['취미·여가·여행', '맛집'], '여행': ['취미·여가·여행', '국내여행'],
        'IT·테크': ['지식·동향', 'IT·컴퓨터'], '경제·주식': ['지식·동향', '비즈니스·경제'],
        '축제·행사': ['취미·여가·여행', '국내여행'], '영화·공연': ['엔터테인먼트·예술', '영화'],
        '방송·OTT': ['엔터테인먼트·예술', '방송'],
    };

    const DEFAULT_PREFERENCE = Object.freeze({ category_group: '생활·노하우·쇼핑', category: '일상·생각', persona: '친근한 이웃 블로거', tone_level: 'balanced', detail_level: 'normal', custom_instruction: '', enabled: true });

    const state = {
        preference: { ...DEFAULT_PREFERENCE },
        authenticated: false,
        profiles: [],
        activeProfileId: null,
        editingProfileId: null,
        profileName: '기본 페르소나',
        profileCount: 0,
        profileLimit: 0,
        closeTimer: null,
        closePanel: null,
        closeLibrary: null,
    };

    function modalMarkup() {
        return `<div id="ai-persona-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="ai-persona-title">
            <div class="modal-card ai-persona-card">
                <div class="modal-header"><h3 id="ai-persona-title" class="ui-icon-heading"><i data-lucide="wand-sparkles"></i><span>AI 페르소나·톤앤매너 설정</span></h3><button id="ai-persona-close" class="modal-close-btn" type="button" aria-label="닫기">&times;</button></div>
                <div class="ai-persona-body">
                    <section class="ai-persona-enabled-row"><div><strong>AI 페르소나·톤앤매너 적용</strong><span>끄더라도 선택한 설정값은 계정에 그대로 보관됩니다.</span></div><label class="ai-persona-switch"><input id="ai-persona-enabled" type="checkbox" role="switch" aria-label="AI 페르소나·톤앤매너 적용 여부"><span class="ai-persona-switch-track" aria-hidden="true"></span><b id="ai-persona-enabled-label">사용 중</b></label></section>
                    <section class="ai-persona-profile-name-row"><label for="ai-persona-profile-name"><strong>페르소나 이름</strong><span>내 페르소나함에서 구분할 이름을 입력하세요.</span></label><input id="ai-persona-profile-name" type="text" maxlength="60" value="기본 페르소나" autocomplete="off"></section>
                    <section><div class="ai-persona-section-head"><strong>작성 카테고리</strong><span>대분류를 먼저 선택하세요.</span></div><div id="ai-persona-category-groups" class="ai-persona-chips ai-persona-group-chips"></div></section>
                    <section id="ai-persona-topic-section"><div class="ai-persona-section-head"><strong>세부 주제</strong><span>글의 관점과 구성에 반영됩니다.</span></div><div id="ai-persona-categories" class="ai-persona-chips ai-persona-topic-chips"></div></section>
                    <section><div class="ai-persona-section-head"><strong>톤앤매너</strong><span>원클릭으로 원하는 작성자를 선택하세요.</span></div><div id="ai-persona-presets" class="ai-persona-grid"></div></section>
                    <section class="ai-persona-controls">
                        <label>말투 강도<select id="ai-persona-tone"><option value="calm">차분하게</option><option value="balanced">균형 있게</option><option value="lively">생동감 있게</option></select></label>
                        <label>글의 밀도<select id="ai-persona-detail"><option value="concise">간결하게</option><option value="normal">보통</option><option value="detailed">상세하게</option></select></label>
                    </section>
                    <section><label class="ai-persona-custom-label" for="ai-persona-custom">나만의 추가 지침 <span>선택 사항 · 최대 2,000자</span></label><textarea id="ai-persona-custom" maxlength="2000" placeholder="예: 핵심 결론을 먼저 쓰고, 문단은 3~4문장으로 구성해 주세요."></textarea></section>
                    <div id="ai-persona-preview" class="ai-persona-preview"></div>
                    <p id="ai-persona-status" class="ai-persona-status" aria-live="polite"></p>
                    <div class="ai-persona-actions"><button id="ai-persona-reset" type="button" class="secondary">새 페르소나</button><div class="ai-persona-library-control"><button id="ai-persona-library-open" type="button">내 페르소나함</button><button id="ai-persona-save" type="button">저장</button><span id="ai-persona-profile-count" aria-label="저장된 페르소나 수">0</span></div></div>
                </div>
            </div>
        </div>
        <div id="ai-persona-library-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="ai-persona-library-title">
            <div class="modal-card ai-persona-library-card">
                <div class="modal-header"><h3 id="ai-persona-library-title" class="ui-icon-heading"><i data-lucide="library"></i><span>내 페르소나함</span></h3><button id="ai-persona-library-close" class="modal-close-btn" type="button" aria-label="닫기">&times;</button></div>
                <div class="ai-persona-library-body">
                    <div class="ai-persona-library-head"><div><strong>저장한 페르소나·톤앤매너</strong><span id="ai-persona-library-quota">0 / 0개</span></div><button id="ai-persona-library-new" type="button"><i data-lucide="plus"></i>새 페르소나 작성</button></div>
                    <div id="ai-persona-library-list" class="ai-persona-library-list"></div>
                    <p id="ai-persona-library-status" class="ai-persona-status" aria-live="polite"></p>
                </div>
            </div>
        </div>`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    }

    function generatedProfileName() {
        const preference = state.preference;
        const toneName = { calm: '차분하게', balanced: '균형 있게', lively: '생동감 있게' }[preference.tone_level] || '균형 있게';
        const detailName = { concise: '간결하게', normal: '보통', detailed: '상세하게' }[preference.detail_level] || '보통';
        const parts = preference.category_group === '주제 선택 안 함'
            ? ['주제 선택 안 함', preference.persona || 'AI 작성자', toneName, detailName]
            : [preference.category_group, preference.category, preference.persona || 'AI 작성자', toneName, detailName];
        return parts.filter(Boolean).join(' · ').slice(0, 60);
    }

    function instruction() {
        const p = state.preference;
        if (p.enabled === false) return '';
        const preset = (PRESETS[p.category_group] || []).find(item => item[0] === p.persona);
        const tone = { calm: '차분하고 절제된 존댓말', balanced: '친근함과 전문성이 균형 잡힌 존댓말', lively: '생동감 있고 친근한 존댓말' }[p.tone_level];
        const detail = { concise: '핵심만 간결하게', normal: '필요한 정보를 충분히 포함하되 군더더기 없이', detailed: '배경과 맥락까지 상세하게' }[p.detail_level];
        const categoryLines = p.category_group === '주제 선택 안 함'
            ? '작성 주제: 선택 안 함 · 현재 입력 자료에서 주제를 판단하세요.'
            : `카테고리 대분류: ${p.category_group}\n세부 주제: ${p.category}`;
        return `[사용자 AI 작성 개인화 지침]\n${categoryLines}\n페르소나: ${p.persona}\n역할: ${preset ? preset[1] : ''}\n말투: ${tone}\n글의 밀도: ${detail}\n${p.custom_instruction ? `사용자 추가 지침: ${p.custom_instruction}\n` : ''}확인되지 않은 경험·수치·출처를 만들지 말고 운영자 공통 팩트 지침을 항상 우선하세요.`;
    }

    function setStatus(message, type) {
        const el = document.getElementById('ai-persona-status');
        el.textContent = message || '';
        el.className = `ai-persona-status${type ? ` ${type}` : ''}`;
    }

    function setLibraryStatus(message, type) {
        const el = document.getElementById('ai-persona-library-status');
        if (!el) return;
        el.textContent = message || '';
        el.className = 'ai-persona-status' + (type ? ' ' + type : '');
    }

    function applyProfileToState(profile) {
        if (!profile) return;
        const enabled = state.preference.enabled !== false;
        state.preference = {
            ...DEFAULT_PREFERENCE,
            category_group: profile.category_group,
            category: profile.category,
            persona: profile.persona,
            tone_level: profile.tone_level,
            detail_level: profile.detail_level,
            custom_instruction: profile.custom_instruction || '',
            enabled,
        };
        state.editingProfileId = profile.id;
        state.activeProfileId = profile.id;
        state.profileName = profile.name || '기본 페르소나';
    }

    function updateProfileState(result) {
        state.profiles = Array.isArray(result.profiles) ? result.profiles : [];
        state.activeProfileId = result.active_profile_id || null;
        state.profileCount = Number(result.count || state.profiles.length);
        state.profileLimit = Number(result.limit || 0);
        const active = state.profiles.find(profile => profile.id === state.activeProfileId);
        if (active && !state.editingProfileId) {
            state.editingProfileId = active.id;
            state.profileName = active.name;
        }
        renderLibrary();
    }

    function renderLibrary() {
        const count = document.getElementById('ai-persona-profile-count');
        const ruleCount = document.getElementById('system-persona-count-badge');
        const quota = document.getElementById('ai-persona-library-quota');
        const newButton = document.getElementById('ai-persona-library-new');
        if (count) count.textContent = String(state.profileCount);
        if (ruleCount) ruleCount.textContent = String(state.profileCount);
        if (quota) quota.textContent = state.authenticated ? state.profileCount + ' / ' + state.profileLimit + '개' : '로그인 필요';
        if (newButton) {
            const limitReached = state.authenticated && state.profileCount >= state.profileLimit;
            newButton.classList.toggle('is-limit-reached', limitReached);
            newButton.setAttribute('aria-disabled', String(limitReached));
            newButton.dataset.tooltip = limitReached ? '저장 한도(권한 등급)가 초과되어 새 페르소나를 추가할 수 없습니다.' : '새 페르소나를 작성합니다.';
        }
        const list = document.getElementById('ai-persona-library-list');
        if (!list) return;
        if (!state.authenticated) {
            list.innerHTML = '<div class="ai-persona-library-empty">로그인하면 나만의 페르소나를 저장하고 여러 글에 다시 적용할 수 있습니다.</div>';
            return;
        }
        if (!state.profiles.length) {
            list.innerHTML = '<div class="ai-persona-library-empty">저장된 페르소나가 없습니다.<br>새 페르소나를 작성해 보세요.</div>';
            return;
        }
        list.innerHTML = state.profiles.map(profile => {
            const active = Number(profile.is_active) === 1 || profile.id === state.activeProfileId;
            const category = profile.category_group === '주제 선택 안 함' ? '주제 선택 안 함' : profile.category_group + ' · ' + profile.category;
            return '<article class="ai-persona-library-item' + (active ? ' is-active' : '') + '" data-profile-id="' + escapeHtml(profile.id) + '">' +
                '<div class="ai-persona-library-item-main"><div><strong>' + escapeHtml(profile.name) + '</strong>' + (active ? '<span class="ai-persona-active-badge">✓ 사용 중</span>' : '') + '</div>' +
                '<p>' + escapeHtml(category) + ' · ' + escapeHtml(profile.persona) + '</p></div>' +
                '<div class="ai-persona-library-item-actions">' +
                (active ? '' : '<button type="button" data-action="activate">적용</button>') +
                '<button type="button" data-action="edit">수정</button><button type="button" data-action="duplicate">복제</button>' +
                '<button type="button" data-action="delete" class="danger" aria-label="' + escapeHtml(profile.name) + ' 삭제"><i data-lucide="trash-2"></i></button></div></article>';
        }).join('');
        window.TrafficCatcherIcons?.refresh(list);
    }

    function updateWritingButtons() {
        const enabled = state.preference.enabled !== false;
        const category = String(state.preference.category || '').trim();
        const persona = String(state.preference.persona || '').trim();
        const prefix = [category && category !== '주제 선택 안 함' ? category : '', persona].filter(Boolean).join(' · ');
        const label = enabled && prefix ? prefix + ' · 글쓰기' : '글쓰기';
        document.querySelectorAll('#btn-auto-search-3news, #btn-story-preview-generate, .ai-article-ready-group .btn-start-live-generate').forEach(button => {
            if (button.disabled) return;
            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'pen-line');
            const content = [icon];
            if (enabled && prefix) {
                const personaName = document.createElement('span');
                personaName.className = 'ai-persona-writing-name';
                personaName.textContent = prefix;
                const separator = document.createElement('span');
                separator.className = 'ai-persona-writing-separator';
                separator.setAttribute('aria-hidden', 'true');
                separator.textContent = '·';
                content.push(personaName, separator);
            }
            const action = document.createElement('span');
            action.className = 'ai-persona-writing-action';
            action.textContent = '글쓰기';
            content.push(action);
            button.replaceChildren(...content);
            window.TrafficCatcherIcons?.refresh(button);
            button.setAttribute('aria-label', label);
        });
    }

    function render() {
        const groups = document.getElementById('ai-persona-category-groups');
        groups.innerHTML = Object.keys(CATEGORY_GROUPS).map(group => `<button type="button" data-category-group="${group}" class="${group === state.preference.category_group ? 'active' : ''}">${group}</button>`).join('');
        const categories = document.getElementById('ai-persona-categories');
        const topics = CATEGORY_GROUPS[state.preference.category_group] || [];
        categories.innerHTML = topics.map(category => `<button type="button" data-category="${category}" class="${category === state.preference.category ? 'active' : ''}">${category}</button>`).join('');
        document.getElementById('ai-persona-topic-section').hidden = topics.length === 0;
        const presets = document.getElementById('ai-persona-presets');
        presets.innerHTML = (PRESETS[state.preference.category_group] || []).map(([name, description]) => `<button type="button" data-persona="${name}" class="${name === state.preference.persona ? 'active' : ''}"><strong class="ai-persona-name">${name}</strong><span class="ai-persona-description">${description}</span></button>`).join('');
        document.getElementById('ai-persona-tone').value = state.preference.tone_level;
        document.getElementById('ai-persona-detail').value = state.preference.detail_level;
        document.getElementById('ai-persona-custom').value = state.preference.custom_instruction;
        document.getElementById('ai-persona-profile-name').value = state.profileName;
        const enabled = state.preference.enabled !== false;
        document.getElementById('ai-persona-enabled').checked = enabled;
        document.getElementById('ai-persona-enabled-label').textContent = enabled ? '사용 중' : '사용 안 함';
        document.querySelector('.ai-persona-body').classList.toggle('persona-disabled', !enabled);
        document.getElementById('ai-persona-preview').innerHTML = enabled
            ? `<strong>현재 적용</strong><span>${state.preference.category_group === '주제 선택 안 함' ? '주제 선택 안 함' : `${state.preference.category_group} · ${state.preference.category}`} · ${state.preference.persona}</span><p>${instruction().split('\n').slice(3, 7).join(' · ')}</p>`
            : '<strong>현재 미적용</strong><span>글을 작성할 때 페르소나·톤앤매너 지침을 AI에 전달하지 않습니다.</span>';
        document.getElementById('ai-persona-summary').textContent = `${state.preference.category || '주제 선택 안 함'} · ${state.preference.persona}`;
        const statusBadge = document.getElementById('ai-persona-button-status');
        statusBadge.textContent = enabled ? '● 사용 중' : '○ 사용 안 함';
        document.getElementById('btn-open-ai-persona')?.classList.toggle('is-disabled', !enabled);
        renderLibrary();
        updateWritingButtons();
        document.dispatchEvent(new CustomEvent('tc:persona-updated', {
            detail: { enabled, preference: { ...state.preference }, instruction: instruction() }
        }));
    }

    async function loadPreference() {
        state.preference = { ...DEFAULT_PREFERENCE };
        state.profiles = [];
        state.activeProfileId = null;
        state.editingProfileId = null;
        state.profileName = '기본 페르소나';
        state.profileCount = 0;
        state.profileLimit = 0;
        await window.TrafficCatcherAuth?.whenReady?.();
        state.authenticated = Boolean(window.TrafficCatcherAuth?.getUser?.());
        if (state.authenticated) {
            const [result, profilesResult] = await Promise.all([
                fetch('/api/auth/preferences/ai-persona', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
                fetch('/api/auth/preferences/persona-profiles', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
            ]);
            if (result.preference) {
                const saved = result.preference;
                const legacy = LEGACY_CATEGORY_MAP[saved.category];
                state.preference = { ...state.preference, ...saved, enabled: saved.enabled !== 0 && saved.enabled !== false };
                if (!saved.category_group || !CATEGORY_GROUPS[saved.category_group] || legacy) {
                    [state.preference.category_group, state.preference.category] = legacy || ['생활·노하우·쇼핑', '일상·생각'];
                }
                const availablePresets = PRESETS[state.preference.category_group] || [];
                if (!availablePresets.some(item => item[0] === state.preference.persona)) state.preference.persona = availablePresets[0]?.[0] || '친근한 이웃 블로거';
            }
            if (profilesResult.status === 'success') {
                updateProfileState(profilesResult);
                const active = state.profiles.find(profile => profile.id === state.activeProfileId);
                if (active) {
                    state.editingProfileId = active.id;
                    state.profileName = active.name;
                } else {
                    state.profileName = generatedProfileName();
                }
            }
        }
        render();
        setStatus(state.authenticated ? '로그인 계정에 저장된 설정입니다.' : '선택은 바로 적용되며, 계정 저장은 로그인 후 가능합니다.', state.authenticated ? 'success' : '');
    }

    async function persistPreference(preference = state.preference) {
        const response = await fetch('/api/auth/preferences/ai-persona', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(preference)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || '저장하지 못했습니다.');
        return result;
    }

    async function requestProfiles(method = 'GET', payload = null, profileId = '') {
        const url = '/api/auth/preferences/persona-profiles' + (profileId ? '?id=' + encodeURIComponent(profileId) : '');
        const options = { method, credentials: 'include', headers: {} };
        if (payload) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(payload);
        }
        const response = await fetch(url, options);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || '내 페르소나함을 처리하지 못했습니다.');
        updateProfileState(result);
        return result;
    }

    async function setEnabled(enabled) {
        await window.TrafficCatcherAuth?.whenReady?.();
        state.authenticated = Boolean(window.TrafficCatcherAuth?.getUser?.());
        if (!state.authenticated) throw new Error('페르소나 설정을 변경하려면 먼저 로그인해 주세요.');
        const previous = state.preference.enabled !== false;
        const next = Boolean(enabled);
        if (previous === next) return { enabled: next, preference: { ...state.preference } };
        state.preference = { ...state.preference, enabled: next };
        try {
            const result = await persistPreference(state.preference);
            render();
            setStatus(result.message || (next ? '페르소나 지침을 사용합니다.' : '페르소나 지침을 사용하지 않습니다.'), 'success');
            return { ...result, enabled: next, preference: { ...state.preference } };
        } catch (error) {
            state.preference = { ...state.preference, enabled: previous };
            render();
            throw error;
        }
    }

    async function savePreference() {
        if (!state.authenticated) { setStatus('사용자별 설정을 저장하려면 먼저 로그인해 주세요.', 'error'); return; }
        const name = String(state.profileName || '').replace(/\s+/g, ' ').trim();
        if (name.length < 2 || name.length > 60) { setStatus('페르소나 이름은 2~60자로 입력해 주세요.', 'error'); return; }
        const button = document.getElementById('ai-persona-save');
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.innerHTML = '<span class="ai-persona-save-spinner" aria-hidden="true"></span><span>저장 중…</span>';
        try {
            if (!state.editingProfileId) {
                await requestProfiles('GET');
                state.profileName = name;
            }
            const payload = { ...state.preference, name, activate: true };
            const result = state.editingProfileId
                ? await requestProfiles('PUT', payload, state.editingProfileId)
                : await requestProfiles('POST', payload);
            await persistPreference(state.preference);
            state.editingProfileId = result.profile_id;
            state.activeProfileId = result.profile_id;
            state.profileName = name;
            render();
            setStatus(result.message, 'success');
        } catch (error) { setStatus(error.message, 'error'); }
        finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = '저장';
        }
    }

    function startNewProfile() {
        if (state.authenticated && state.profileCount >= state.profileLimit) {
            const message = '저장 한도(권한 등급)가 초과되었습니다. 기존 페르소나는 유지되며 새 페르소나만 추가할 수 없습니다.';
            setLibraryStatus(message, 'error');
            setStatus(message, 'error');
            return;
        }
        state.preference = { ...DEFAULT_PREFERENCE, enabled: state.preference.enabled !== false };
        state.editingProfileId = null;
        state.profileName = generatedProfileName();
        render();
        setStatus('새 페르소나의 이름과 설정을 입력한 뒤 저장하세요.', '');
        state.closeLibrary?.();
        document.getElementById('ai-persona-profile-name')?.focus();
    }

    async function openLibrary() {
        if (!state.authenticated) {
            setStatus('내 페르소나함은 로그인 후 사용할 수 있습니다.', 'error');
            return;
        }
        const modal = document.getElementById('ai-persona-library-modal');
        modal.classList.remove('hidden');
        setLibraryStatus('목록을 불러오는 중입니다.', '');
        try {
            await requestProfiles('GET');
            setLibraryStatus(state.profileCount ? '사용할 페르소나를 적용하거나 수정할 수 있습니다.' : '새 페르소나를 저장해 보세요.', 'success');
        } catch (error) {
            setLibraryStatus(error.message, 'error');
        }
    }

    async function handleLibraryAction(event) {
        const button = event.target.closest('[data-action]');
        const item = event.target.closest('[data-profile-id]');
        if (!button || !item) return;
        const profile = state.profiles.find(value => value.id === item.dataset.profileId);
        if (!profile) return;
        const action = button.dataset.action;
        button.disabled = true;
        try {
            if (action === 'activate') {
                await requestProfiles('PUT', { action: 'activate' }, profile.id);
                applyProfileToState(profile);
                render();
                setLibraryStatus(profile.name + ' 페르소나를 적용했습니다.', 'success');
            } else if (action === 'edit') {
                applyProfileToState(profile);
                render();
                setStatus(profile.name + ' 페르소나를 편집하고 있습니다.', 'success');
                state.closeLibrary?.();
                document.getElementById('ai-persona-profile-name')?.focus();
            } else if (action === 'duplicate') {
                let name = profile.name + ' 복사본';
                let index = 2;
                while (state.profiles.some(value => value.name === name)) name = profile.name + ' 복사본 ' + index++;
                const result = await requestProfiles('POST', { ...profile, id: undefined, name, activate: false });
                setLibraryStatus(result.message, 'success');
            } else if (action === 'delete') {
                if (!window.confirm('「' + profile.name + '」 페르소나를 삭제하시겠습니까?')) return;
                await requestProfiles('DELETE', null, profile.id);
                if (state.editingProfileId === profile.id) {
                    const active = state.profiles.find(value => value.id === state.activeProfileId);
                    if (active) applyProfileToState(active);
                    else {
                        state.editingProfileId = null;
                        state.profileName = '새 페르소나';
                    }
                    render();
                }
                setLibraryStatus('페르소나를 삭제했습니다.', 'success');
            }
        } catch (error) {
            setLibraryStatus(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    function init() {
        const adminButton = document.getElementById('btn-open-system-instruction');
        if (!adminButton) return;
        const button = document.createElement('button');
        button.id = 'btn-open-ai-persona'; button.type = 'button'; button.className = 'btn-ai-persona';
        button.setAttribute('aria-describedby', 'ai-persona-button-tooltip');
        button.innerHTML = '<strong id="ai-persona-summary">일상·생각 · 친근한 이웃 블로거</strong><span>AI 페르소나·톤앤매너 설정 <em id="ai-persona-button-status">● 사용 중</em></span>';
        const studioHeader = document.body.classList.contains('studio-page')
            ? document.querySelector('#ai-studio-modal .modal-header')
            : null;
        if (studioHeader) {
            studioHeader.append(button);
            const tooltip = document.createElement('span');
            tooltip.id = 'ai-persona-button-tooltip';
            tooltip.className = 'ai-persona-button-tooltip';
            tooltip.setAttribute('role', 'tooltip');
            tooltip.textContent = '글의 카테고리, 페르소나, 말투와 개인 지침을 설정합니다.';
            studioHeader.append(tooltip);
        }
        else adminButton.before(button);
        document.body.insertAdjacentHTML('beforeend', modalMarkup());
        const modal = document.getElementById('ai-persona-modal');
        const libraryModal = document.getElementById('ai-persona-library-modal');
        window.TrafficCatcherIcons?.refresh(modal);
        window.TrafficCatcherIcons?.refresh(libraryModal);
        const openPanel = async () => {
            clearTimeout(state.closeTimer);
            modal.classList.remove('hidden', 'is-closing');
            await loadPreference();
        };
        const closePanel = () => {
            if (modal.classList.contains('hidden') || modal.classList.contains('is-closing')) return;
            modal.classList.add('is-closing');
            clearTimeout(state.closeTimer);
            state.closeTimer = setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('is-closing');
            }, 520);
        };
        state.closePanel = closePanel;
        const closeLibrary = () => libraryModal.classList.add('hidden');
        state.closeLibrary = closeLibrary;
        button.addEventListener('click', openPanel);
        document.getElementById('ai-persona-close').addEventListener('click', closePanel);
        modal.addEventListener('click', event => { if (event.target === modal) closePanel(); });
        document.getElementById('ai-persona-library-open').addEventListener('click', openLibrary);
        document.getElementById('btn-open-persona-library-from-rules')?.addEventListener('click', openLibrary);
        document.getElementById('ai-persona-library-close').addEventListener('click', closeLibrary);
        document.getElementById('ai-persona-library-new').addEventListener('click', startNewProfile);
        document.getElementById('ai-persona-library-list').addEventListener('click', handleLibraryAction);
        libraryModal.addEventListener('click', event => { if (event.target === libraryModal) closeLibrary(); });
        document.getElementById('ai-persona-category-groups').addEventListener('click', event => {
            const group = event.target.closest('[data-category-group]')?.dataset.categoryGroup; if (!group) return;
            state.preference.category_group = group;
            state.preference.category = CATEGORY_GROUPS[group][0] || '';
            state.preference.persona = PRESETS[group][0][0];
            state.profileName = generatedProfileName();
            render();
        });
        document.getElementById('ai-persona-categories').addEventListener('click', event => {
            const category = event.target.closest('[data-category]')?.dataset.category; if (!category) return;
            state.preference.category = category; state.profileName = generatedProfileName(); render();
        });
        document.getElementById('ai-persona-presets').addEventListener('click', event => {
            const persona = event.target.closest('[data-persona]')?.dataset.persona; if (!persona) return; state.preference.persona = persona; state.profileName = generatedProfileName(); render();
        });
        document.getElementById('ai-persona-tone').addEventListener('change', event => { state.preference.tone_level = event.target.value; state.profileName = generatedProfileName(); render(); });
        document.getElementById('ai-persona-detail').addEventListener('change', event => { state.preference.detail_level = event.target.value; state.profileName = generatedProfileName(); render(); });
        document.getElementById('ai-persona-enabled').addEventListener('change', event => { state.preference.enabled = event.target.checked; render(); });
        document.getElementById('ai-persona-profile-name').addEventListener('input', event => { state.profileName = event.target.value; });
        document.getElementById('ai-persona-custom').addEventListener('input', event => { state.preference.custom_instruction = event.target.value; document.getElementById('ai-persona-summary').textContent = `${state.preference.category || '주제 선택 안 함'} · ${state.preference.persona}`; });
        document.getElementById('ai-persona-reset').addEventListener('click', startNewProfile);
        document.getElementById('ai-persona-save').addEventListener('click', savePreference);
        loadPreference();
    }

    window.TrafficCatcherPersona = { getInstruction: instruction, getPreference: () => ({ ...state.preference }), setEnabled, updateWritingButtons, openLibrary };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
