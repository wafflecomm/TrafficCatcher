(function () {
    'use strict';
    const KEY = 'traffic_catcher_ui_preference';
    const defaults = { font_family: 'paperlogy', font_scale: 'normal', font_weight: '400' };
    const fontMap = {
        paperlogy: '"Paperlogy", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        pretendard: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        suit: '"SUIT Variable", SUIT, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        noto: '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        serif: 'Georgia, "Noto Serif KR", serif'
    };
    const scaleMap = { compact: 14.5, normal: 16, large: 17.5 };
    let currentUser = null;

    function applyPreference(value) {
        const pref = { ...defaults, ...(value || {}) };
        document.documentElement.style.fontSize = `${scaleMap[pref.font_scale] || 16}px`;
        document.documentElement.style.setProperty('--tc-user-font', fontMap[pref.font_family] || fontMap.paperlogy);
        document.documentElement.style.setProperty('--tc-user-weight', pref.font_weight || '400');
        document.body.classList.add('tc-font-personalized');
        localStorage.setItem(KEY, JSON.stringify(pref));
    }

    function storedPreference() { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { return { ...defaults }; } }
    applyPreference(storedPreference());

    function build() {
        const root = document.createElement('div');
        root.id = 'member-profile-page'; root.className = 'member-profile-page'; root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `<section class="member-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="member-profile-title">
          <header class="member-profile-header"><h2 id="member-profile-title">내 프로필</h2><button class="member-profile-close" type="button" aria-label="프로필 닫기">×</button></header>
          <div class="member-profile-content">
            <div class="profile-account-card"><div class="profile-avatar" id="profile-avatar">U</div><div><h3 id="profile-nickname">사용자</h3><p id="profile-email"></p></div><span class="profile-plan-badge" id="profile-plan-badge">FREE</span></div>
            <section class="profile-section"><div class="profile-section-head"><h3>회원 등급 및 이용 권한</h3><span>현재 요금제</span></div><div class="profile-plan-row"><strong id="profile-plan-name">무료 회원</strong><span id="profile-account-role">일반 회원</span><small>AI 글쓰기와 개인 설정을 이용할 수 있습니다. 유료 요금제와 사용량 관리는 결제 기능 연결 후 제공됩니다.</small></div></section>
            <section class="profile-section"><div class="profile-section-head"><h3>화면 글꼴 개인 설정</h3><span>모든 페이지에 적용</span></div>
              <div class="profile-font-grid"><label>글꼴<select id="profile-font-family"><option value="paperlogy">Paperlogy · 추천</option><option value="pretendard">Pretendard</option><option value="suit">SUIT</option><option value="noto">Noto Sans KR</option><option value="system">시스템 고딕</option><option value="serif">명조·세리프</option></select></label><label>글자 크기<select id="profile-font-scale"><option value="compact">작게</option><option value="normal">보통</option><option value="large">크게</option></select></label><label>기본 두께<select id="profile-font-weight"><option value="300">얇게</option><option value="400">보통</option><option value="500">중간</option></select></label></div>
              <p class="profile-font-preview">실시간 이슈와 뉴스 팩트를 읽기 편한 화면으로 설정합니다.</p><div class="profile-actions"><button id="profile-font-reset" type="button">기본값</button><button id="profile-font-save" class="primary" type="button">글꼴 설정 저장</button></div><p id="profile-status" class="profile-status" aria-live="polite"></p>
            </section>
            <section class="profile-section"><div class="profile-section-head"><h3>AI 개인화</h3><span>글쓰기 환경</span></div><div class="profile-shortcuts"><button class="profile-shortcut" id="profile-open-persona" type="button">AI 글쓰기 설정</button><button class="profile-shortcut" id="profile-open-instruction" type="button">AI 시스템 지침 관리</button></div></section>
          </div></section>`;
        document.body.append(root); return root;
    }

    async function request(path, options = {}) {
        const res = await fetch(path, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await res.json().catch(() => ({}))
            : {};
        if (!res.ok) {
            const error = new Error(data.message || (res.status === 404 ? 'PROFILE_API_NOT_READY' : `HTTP ${res.status}`));
            error.status = res.status;
            throw error;
        }
        return data;
    }
    function controls(root) { return { family: root.querySelector('#profile-font-family'), scale: root.querySelector('#profile-font-scale'), weight: root.querySelector('#profile-font-weight'), status: root.querySelector('#profile-status') }; }
    function fill(root, pref) { const c = controls(root), p = { ...defaults, ...pref }; c.family.value=p.font_family;c.scale.value=p.font_scale;c.weight.value=p.font_weight; applyPreference(p); }
    function read(root) { const c=controls(root); return { font_family:c.family.value,font_scale:c.scale.value,font_weight:c.weight.value }; }
    function status(root, text, type='') { const el=controls(root).status;el.textContent=text;el.className=`profile-status${type?' '+type:''}`; }
    function close(root) { root.classList.remove('is-open');root.setAttribute('aria-hidden','true');document.body.style.overflow=''; }
    async function open(root, suppliedUser) {
        try { const session = suppliedUser ? { authenticated:true,user:suppliedUser } : await request('/api/auth/session'); if (!session.authenticated) { document.getElementById('member-auth-modal')?.classList.remove('hidden'); return; } currentUser=session.user; }
        catch (_) { return; }
        const role = currentUser.role === 'admin' ? '관리자' : '일반 회원';
        root.querySelector('#profile-avatar').textContent=String(currentUser.nickname||currentUser.email||'U').charAt(0).toUpperCase();root.querySelector('#profile-nickname').textContent=currentUser.nickname;root.querySelector('#profile-email').textContent=currentUser.email;root.querySelector('#profile-account-role').textContent=role;
        fill(root, storedPreference());
        try { const data=await request('/api/auth/preferences/ui'); if(data.preference) fill(root,data.preference); } catch (_) {}
        root.classList.add('is-open');root.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';root.querySelector('.member-profile-close').focus();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const root=build(); const preview=()=>applyPreference(read(root));
        root.querySelectorAll('select').forEach(el=>el.addEventListener('change',preview));
        root.querySelector('.member-profile-close').addEventListener('click',()=>close(root));root.addEventListener('click',e=>{if(e.target===root)close(root);});
        root.querySelector('#profile-font-reset').addEventListener('click',()=>{fill(root,defaults);status(root,'기본 글꼴 설정으로 되돌렸습니다.');});
        root.querySelector('#profile-font-save').addEventListener('click',async()=>{const pref=read(root);applyPreference(pref);try{await request('/api/auth/preferences/ui',{method:'PUT',body:JSON.stringify(pref)});status(root,'개인 글꼴 설정을 계정에 저장했습니다.','success');}catch(e){const pending=e.status===404||e.message==='PROFILE_API_NOT_READY';status(root,pending?'현재 브라우저에 저장했습니다. 서버 재시작 후 계정과 동기화됩니다.':'현재 브라우저에 저장했습니다. 계정 동기화는 잠시 후 다시 시도해 주세요.',pending?'pending':'error');}});
        root.querySelector('#profile-open-persona').addEventListener('click',()=>{close(root);document.querySelector('.btn-ai-persona')?.click();});
        root.querySelector('#profile-open-instruction').addEventListener('click',()=>{
            close(root);
            document.getElementById('btn-open-system-instruction')?.click();
        });
        document.addEventListener('tc:open-profile',e=>open(root,e.detail?.user));
        document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('is-open'))close(root);});
    });
})();
