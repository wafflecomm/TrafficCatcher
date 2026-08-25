(function () {
    'use strict';

    const PRESETS = {
        '뷰티': [
            ['친근한 뷰티 크리에이터', '사용감과 피부 타입별 차이를 친근하게 설명합니다.'],
            ['전문 뷰티 에디터', '성분과 특징을 차분하고 객관적으로 분석합니다.'],
        ],
        'IT·테크': [
            ['전문 테크 에디터', '사양·성능·활용 사례를 명확하게 비교합니다.'],
            ['쉬운 IT 안내자', '어려운 기술을 초보자도 이해하기 쉽게 풀어냅니다.'],
        ],
        '맛집': [
            ['솔직한 미식 리뷰어', '메뉴·가격·맛·분위기와 아쉬운 점을 균형 있게 씁니다.'],
            ['친근한 이웃 블로거', '독자에게 이야기하듯 편안하고 생생하게 소개합니다.'],
        ],
        '여행': [
            ['실용 여행 가이드', '동선·비용·교통·운영시간과 방문 팁을 중심으로 씁니다.'],
            ['감성 여행 에디터', '장소의 분위기와 의미를 담되 사실을 과장하지 않습니다.'],
        ],
        '일상': [
            ['친근한 이웃 블로거', '공감할 수 있는 자연스러운 존댓말로 씁니다.'],
            ['담백한 라이프 에디터', '과장 없이 정돈된 문장으로 일상의 정보를 전달합니다.'],
        ],
        '경제·주식': [
            ['신중한 시장 분석가', '수치와 출처를 중심으로 분석하고 투자 권유 표현을 피합니다.'],
            ['경제 뉴스 에디터', '시장 배경과 영향을 일반 독자 눈높이로 설명합니다.'],
        ],
        '축제·행사': [
            ['지역 문화 안내자', '일정·장소·교통·관람 팁을 빠짐없이 안내합니다.'],
            ['가족 나들이 큐레이터', '가족 방문객 관점의 준비물과 동선을 강조합니다.'],
        ],
        '영화·공연': [
            ['문화 전문 에디터', '작품 정보와 관람 포인트를 세련되고 객관적으로 소개합니다.'],
            ['대중문화 큐레이터', '기대 요소와 화제성을 쉽고 흥미롭게 전달합니다.'],
        ],
        '방송·OTT': [
            ['콘텐츠 큐레이터', '줄거리·출연진·인기 요인을 스포일러 없이 정리합니다.'],
            ['방송 트렌드 에디터', '시청률과 화제성을 근거 중심으로 분석합니다.'],
        ],
    };

    const state = {
        preference: { category: '일상', persona: '친근한 이웃 블로거', tone_level: 'balanced', detail_level: 'normal', custom_instruction: '', enabled: true },
        authenticated: false,
        closeTimer: null,
        closePanel: null,
    };

    function modalMarkup() {
        return `<div id="ai-persona-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="ai-persona-title">
            <div class="modal-card ai-persona-card">
                <div class="modal-header"><h3 id="ai-persona-title">✨ AI 페르소나·톤앤매너 설정</h3><button id="ai-persona-close" class="modal-close-btn" type="button" aria-label="닫기">&times;</button></div>
                <div class="ai-persona-body">
                    <section class="ai-persona-enabled-row"><div><strong>AI 페르소나·톤앤매너 적용</strong><span>끄더라도 선택한 설정값은 계정에 그대로 보관됩니다.</span></div><label class="ai-persona-switch"><input id="ai-persona-enabled" type="checkbox" role="switch" aria-label="AI 페르소나·톤앤매너 적용 여부"><span class="ai-persona-switch-track" aria-hidden="true"></span><b id="ai-persona-enabled-label">사용 중</b></label></section>
                    <section><div class="ai-persona-section-head"><strong>작성 카테고리</strong><span>카테고리에 맞는 페르소나를 추천합니다.</span></div><div id="ai-persona-categories" class="ai-persona-chips"></div></section>
                    <section><div class="ai-persona-section-head"><strong>톤앤매너</strong><span>원클릭으로 원하는 작성자를 선택하세요.</span></div><div id="ai-persona-presets" class="ai-persona-grid"></div></section>
                    <section class="ai-persona-controls">
                        <label>말투 강도<select id="ai-persona-tone"><option value="calm">차분하게</option><option value="balanced">균형 있게</option><option value="lively">생동감 있게</option></select></label>
                        <label>글의 밀도<select id="ai-persona-detail"><option value="concise">간결하게</option><option value="normal">보통</option><option value="detailed">상세하게</option></select></label>
                    </section>
                    <section><label class="ai-persona-custom-label" for="ai-persona-custom">나만의 추가 지침 <span>선택 사항 · 최대 2,000자</span></label><textarea id="ai-persona-custom" maxlength="2000" placeholder="예: 핵심 결론을 먼저 쓰고, 문단은 3~4문장으로 구성해 주세요."></textarea></section>
                    <div id="ai-persona-preview" class="ai-persona-preview"></div>
                    <p id="ai-persona-status" class="ai-persona-status" aria-live="polite"></p>
                    <div class="ai-persona-actions"><button id="ai-persona-reset" type="button" class="secondary">기본값</button><button id="ai-persona-save" type="button">저장하기</button></div>
                </div>
            </div>
        </div>`;
    }

    function instruction() {
        const p = state.preference;
        if (p.enabled === false) return '';
        const preset = (PRESETS[p.category] || []).find(item => item[0] === p.persona);
        const tone = { calm: '차분하고 절제된 존댓말', balanced: '친근함과 전문성이 균형 잡힌 존댓말', lively: '생동감 있고 친근한 존댓말' }[p.tone_level];
        const detail = { concise: '핵심만 간결하게', normal: '필요한 정보를 충분히 포함하되 군더더기 없이', detailed: '배경과 맥락까지 상세하게' }[p.detail_level];
        return `[사용자 AI 작성 개인화 지침]\n카테고리: ${p.category}\n페르소나: ${p.persona}\n역할: ${preset ? preset[1] : ''}\n말투: ${tone}\n글의 밀도: ${detail}\n${p.custom_instruction ? `사용자 추가 지침: ${p.custom_instruction}\n` : ''}확인되지 않은 경험·수치·출처를 만들지 말고 운영자 공통 팩트 지침을 항상 우선하세요.`;
    }

    function setStatus(message, type) {
        const el = document.getElementById('ai-persona-status');
        el.textContent = message || '';
        el.className = `ai-persona-status${type ? ` ${type}` : ''}`;
    }

    function render() {
        const categories = document.getElementById('ai-persona-categories');
        categories.innerHTML = Object.keys(PRESETS).map(category => `<button type="button" data-category="${category}" class="${category === state.preference.category ? 'active' : ''}">${category}</button>`).join('');
        const presets = document.getElementById('ai-persona-presets');
        presets.innerHTML = (PRESETS[state.preference.category] || []).map(([name, description]) => `<button type="button" data-persona="${name}" class="${name === state.preference.persona ? 'active' : ''}"><strong class="ai-persona-name">${name}</strong><span class="ai-persona-description">${description}</span></button>`).join('');
        document.getElementById('ai-persona-tone').value = state.preference.tone_level;
        document.getElementById('ai-persona-detail').value = state.preference.detail_level;
        document.getElementById('ai-persona-custom').value = state.preference.custom_instruction;
        const enabled = state.preference.enabled !== false;
        document.getElementById('ai-persona-enabled').checked = enabled;
        document.getElementById('ai-persona-enabled-label').textContent = enabled ? '사용 중' : '사용 안 함';
        document.querySelector('.ai-persona-body').classList.toggle('persona-disabled', !enabled);
        document.getElementById('ai-persona-preview').innerHTML = enabled
            ? `<strong>현재 적용</strong><span>${state.preference.category} · ${state.preference.persona}</span><p>${instruction().split('\n').slice(3, 6).join(' · ')}</p>`
            : '<strong>현재 미적용</strong><span>글을 작성할 때 페르소나·톤앤매너 지침을 AI에 전달하지 않습니다.</span>';
        document.getElementById('ai-persona-summary').textContent = `${state.preference.category} · ${state.preference.persona}`;
        const statusBadge = document.getElementById('ai-persona-button-status');
        statusBadge.textContent = enabled ? '● 사용 중' : '○ 사용 안 함';
        document.getElementById('btn-open-ai-persona')?.classList.toggle('is-disabled', !enabled);
    }

    async function loadPreference() {
        state.preference = { category: '일상', persona: '친근한 이웃 블로거', tone_level: 'balanced', detail_level: 'normal', custom_instruction: '', enabled: true };
        const session = await fetch('/api/auth/session', { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
        state.authenticated = Boolean(session.authenticated);
        if (state.authenticated) {
            const result = await fetch('/api/auth/preferences/ai-persona', { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
            if (result.preference) state.preference = { ...state.preference, ...result.preference, enabled: result.preference.enabled !== 0 && result.preference.enabled !== false };
        }
        render();
        setStatus(state.authenticated ? '로그인 계정에 저장된 설정입니다.' : '선택은 바로 적용되며, 계정 저장은 로그인 후 가능합니다.', state.authenticated ? 'success' : '');
    }

    async function savePreference() {
        if (!state.authenticated) { setStatus('사용자별 설정을 저장하려면 먼저 로그인해 주세요.', 'error'); return; }
        const button = document.getElementById('ai-persona-save');
        button.disabled = true;
        try {
            const response = await fetch('/api/auth/preferences/ai-persona', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.preference) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '저장하지 못했습니다.');
            setStatus(result.message, 'success');
            state.closePanel?.();
        } catch (error) { setStatus(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    function init() {
        const adminButton = document.getElementById('btn-open-system-instruction');
        if (!adminButton) return;
        const button = document.createElement('button');
        button.id = 'btn-open-ai-persona'; button.type = 'button'; button.className = 'btn-ai-persona';
        button.setAttribute('aria-describedby', 'ai-persona-button-tooltip');
        button.innerHTML = '<strong id="ai-persona-summary">일상 · 친근한 이웃 블로거</strong><span>AI 페르소나·톤앤매너 설정 <em id="ai-persona-button-status">● 사용 중</em></span>';
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
        button.addEventListener('click', openPanel);
        document.getElementById('ai-persona-close').addEventListener('click', closePanel);
        modal.addEventListener('click', event => { if (event.target === modal) closePanel(); });
        document.getElementById('ai-persona-categories').addEventListener('click', event => {
            const category = event.target.closest('[data-category]')?.dataset.category; if (!category) return;
            state.preference.category = category; state.preference.persona = PRESETS[category][0][0]; render();
        });
        document.getElementById('ai-persona-presets').addEventListener('click', event => {
            const persona = event.target.closest('[data-persona]')?.dataset.persona; if (!persona) return; state.preference.persona = persona; render();
        });
        document.getElementById('ai-persona-tone').addEventListener('change', event => { state.preference.tone_level = event.target.value; render(); });
        document.getElementById('ai-persona-detail').addEventListener('change', event => { state.preference.detail_level = event.target.value; render(); });
        document.getElementById('ai-persona-enabled').addEventListener('change', event => { state.preference.enabled = event.target.checked; render(); });
        document.getElementById('ai-persona-custom').addEventListener('input', event => { state.preference.custom_instruction = event.target.value; document.getElementById('ai-persona-summary').textContent = `${state.preference.category} · ${state.preference.persona}`; });
        document.getElementById('ai-persona-reset').addEventListener('click', () => { state.preference = { category: '일상', persona: '친근한 이웃 블로거', tone_level: 'balanced', detail_level: 'normal', custom_instruction: '', enabled: true }; render(); });
        document.getElementById('ai-persona-save').addEventListener('click', savePreference);
        loadPreference();
    }

    window.TrafficCatcherPersona = { getInstruction: instruction, getPreference: () => ({ ...state.preference }) };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
