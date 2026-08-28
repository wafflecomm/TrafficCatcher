(function () {
    'use strict';
    const KEY = 'traffic_catcher_ui_preference';
    const defaults = { font_family: 'paperlogy', font_scale: 'normal', font_weight: '400', theme_mode: 'system' };
    const fontMap = {
        paperlogy: '"Paperlogy", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        pretendard: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        suit: '"SUIT Variable", SUIT, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        noto: '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        serif: 'Georgia, "Noto Serif KR", serif'
    };
    const scaleMap = { compact: 14.5, normal: 16, large: 17.5 };
    const PHOTO_DB_NAME = 'traffic_catcher_profile_cache';
    const PHOTO_STORE = 'avatars';
    const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
    let currentUser = null;
    let profileOpenRequestId = 0;
    const activePhotoUrls = new Map();

    function userPhotoKey(user) {
        return String(user?.id || user?.email || '').trim().toLowerCase();
    }

    function openPhotoDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(PHOTO_DB_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(PHOTO_STORE)) request.result.createObjectStore(PHOTO_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('프로필 사진 저장소를 열지 못했습니다.'));
        });
    }

    async function photoStoreRequest(mode, action) {
        const db = await openPhotoDb();
        try {
            return await new Promise((resolve, reject) => {
                const transaction = db.transaction(PHOTO_STORE, mode);
                const request = action(transaction.objectStore(PHOTO_STORE));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('프로필 사진을 처리하지 못했습니다.'));
            });
        } finally { db.close(); }
    }

    function loadPhoto(user) {
        const key = userPhotoKey(user);
        return key ? photoStoreRequest('readonly', store => store.get(key)).catch(() => null) : Promise.resolve(null);
    }

    function savePhoto(user, blob) {
        return photoStoreRequest('readwrite', store => store.put(blob, userPhotoKey(user)));
    }

    function removePhoto(user) {
        return photoStoreRequest('readwrite', store => store.delete(userPhotoKey(user)));
    }

    async function resizeProfilePhoto(file) {
        if (!file?.type?.startsWith('image/')) throw new Error('이미지 파일을 선택해 주세요.');
        if (file.size > PHOTO_MAX_BYTES) throw new Error('10MB 이하의 사진을 선택해 주세요.');
        const bitmap = await createImageBitmap(file);
        try {
            const size = 256;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const context = canvas.getContext('2d');
            const sourceSize = Math.min(bitmap.width, bitmap.height);
            const sourceX = (bitmap.width - sourceSize) / 2;
            const sourceY = (bitmap.height - sourceSize) / 2;
            context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
            return await new Promise((resolve, reject) => canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('사진을 변환하지 못했습니다.')),
                'image/webp', .84
            ));
        } finally { bitmap.close?.(); }
    }

    function renderAvatar(element, user, blob, slot) {
        if (!element) return;
        const previousUrl = activePhotoUrls.get(slot);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        activePhotoUrls.delete(slot);
        const initial = String(user?.nickname || user?.email || 'U').trim().charAt(0).toUpperCase();
        element.textContent = initial;
        element.classList.remove('has-profile-photo');
        element.style.removeProperty('background-image');
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        activePhotoUrls.set(slot, url);
        element.textContent = '';
        element.style.backgroundImage = `url("${url}")`;
        element.classList.add('has-profile-photo');
    }

    async function applyPhotoEverywhere(user, suppliedBlob) {
        if (!user) return;
        const blob = suppliedBlob === undefined ? await loadPhoto(user) : suppliedBlob;
        renderAvatar(document.getElementById('profile-avatar'), user, blob, 'profile');
        renderAvatar(document.querySelector('#btn-member-auth [data-member-avatar]'), user, blob, 'main');
        renderAvatar(document.getElementById('btn-studio-profile'), user, blob, 'studio');
    }

    function applyPreference(value) {
        const pref = { ...defaults, ...(value || {}) };
        document.documentElement.style.fontSize = `${scaleMap[pref.font_scale] || 16}px`;
        document.documentElement.style.setProperty('--tc-user-font', fontMap[pref.font_family] || fontMap.paperlogy);
        document.documentElement.style.setProperty('--tc-user-weight', pref.font_weight || '400');
        document.body.classList.add('tc-font-personalized');
        localStorage.setItem(KEY, JSON.stringify(pref));
        window.TrafficCatcherTheme?.syncPreference(pref.theme_mode);
        document.dispatchEvent(new CustomEvent('tc:ui-preference-applied', { detail: pref }));
    }

    function storedPreference() { try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { return { ...defaults }; } }
    applyPreference(storedPreference());

    function build() {
        const root = document.createElement('div');
        root.id = 'member-profile-page'; root.className = 'member-profile-page'; root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `<section class="member-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="member-profile-title">
          <header class="member-profile-header"><h2 id="member-profile-title">내 프로필</h2><button class="member-profile-close" type="button" aria-label="프로필 닫기">×</button></header>
          <div class="member-profile-content">
            <div class="profile-account-card"><div class="profile-avatar-wrap"><button class="profile-avatar" id="profile-avatar" type="button" title="프로필 사진 메뉴" aria-label="프로필 사진 메뉴" aria-expanded="false">U</button><span class="profile-avatar-edit" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8.5 6.5 10 4h4l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/></svg></span><div class="profile-photo-menu" id="profile-photo-menu" hidden><button id="profile-photo-select" type="button">사진 선택</button><button id="profile-photo-remove" type="button">기본 이미지</button></div></div><div class="profile-account-info"><h3 id="profile-nickname">사용자</h3><p id="profile-email"></p><small class="profile-photo-note">사진은 현재 브라우저에만 저장됩니다.</small></div><span class="profile-plan-badge" id="profile-plan-badge">FREE</span><input id="profile-photo-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div>
            <section class="profile-section"><div class="profile-section-head"><h3>회원 등급 및 이용 권한</h3><span>현재 요금제</span></div><div class="profile-plan-row"><strong id="profile-plan-name">무료 회원</strong><span id="profile-account-role">일반 회원</span><small>글쓰기와 개인 설정을 이용할 수 있습니다. 유료 요금제와 사용량 관리는 결제 기능 연결 후 제공됩니다.</small></div></section>
            <section class="profile-section profile-billing-section"><div class="profile-section-head"><h3>멤버십 결제</h3><span>플랜 업그레이드</span></div><div class="profile-billing-card"><div class="profile-billing-copy"><strong>Traffic Catcher 멤버십</strong><p>더 많은 글쓰기 사용량과 향후 제공되는 유료 회원 기능을 이용할 수 있습니다.</p><ul><li>글쓰기 사용량 확대</li><li>회원 전용 기능 및 데이터 제공</li><li>결제·구독 내역 관리</li></ul></div><button id="profile-payment-start" type="button">결제하기</button></div><p id="profile-payment-status" class="profile-payment-status" aria-live="polite"></p></section>
            <section class="profile-section profile-accordion"><button class="profile-section-head profile-accordion-trigger" type="button" aria-expanded="false" aria-controls="profile-ai-personalization-content"><span class="profile-accordion-title">AI 개인화</span><span class="profile-accordion-meta">글쓰기 환경 <i aria-hidden="true"></i></span></button><div id="profile-ai-personalization-content" class="profile-accordion-content" hidden><div class="profile-shortcuts"><button class="profile-shortcut" id="profile-open-persona" type="button">AI 페르소나·톤앤매너 설정</button><button class="profile-shortcut" id="profile-open-instruction" type="button">AI 시스템 지침 관리</button></div></div></section>
            <section id="profile-naver-publishing-section" class="profile-section profile-accordion" hidden><button class="profile-section-head profile-accordion-trigger" type="button" aria-expanded="false" aria-controls="profile-naver-publishing-content"><span class="profile-accordion-title">네이버 글쓰기 기능</span><span class="profile-accordion-meta"><b id="profile-naver-publishing-meta">관리자 설정</b> <i aria-hidden="true"></i></span></button><div id="profile-naver-publishing-content" class="profile-accordion-content" hidden><label class="profile-integration-toggle"><span><strong>네이버 글쓰기 열기 버튼</strong><small>글쓰기 페이지와 내 원고함에서 네이버 블로그 글쓰기 화면을 여는 버튼을 표시합니다.</small></span><input id="profile-naver-blog-open-enabled" type="checkbox" role="switch"><i aria-hidden="true"></i></label><p id="profile-naver-publishing-status" class="profile-integration-status" aria-live="polite">관리자 계정에 저장되어 다음 로그인에도 유지됩니다.</p></div></section>
            <section class="profile-section profile-accordion"><button class="profile-section-head profile-accordion-trigger" type="button" aria-expanded="false" aria-controls="profile-font-content"><span class="profile-accordion-title">화면 글꼴 개인 설정</span><span class="profile-accordion-meta">모든 페이지에 적용 <i aria-hidden="true"></i></span></button>
              <div id="profile-font-content" class="profile-accordion-content" hidden><fieldset class="profile-theme-fieldset"><legend>화면 테마</legend><div class="profile-theme-options"><label class="profile-theme-option"><input type="radio" name="profile-theme-mode" value="system"><span>◐ 시스템</span></label><label class="profile-theme-option"><input type="radio" name="profile-theme-mode" value="light"><span>☀ 라이트</span></label><label class="profile-theme-option"><input type="radio" name="profile-theme-mode" value="dark"><span>☾ 다크</span></label></div></fieldset><div class="profile-font-grid"><label>글꼴<select id="profile-font-family"><option value="paperlogy">Paperlogy · 추천</option><option value="pretendard">Pretendard</option><option value="suit">SUIT</option><option value="noto">Noto Sans KR</option><option value="system">시스템 고딕</option><option value="serif">명조·세리프</option></select></label><label>글자 크기<select id="profile-font-scale"><option value="compact">작게</option><option value="normal">보통</option><option value="large">크게</option></select></label><label>기본 두께<select id="profile-font-weight"><option value="300">얇게</option><option value="400">보통</option><option value="500">중간</option></select></label></div>
              <p class="profile-font-preview">실시간 이슈와 뉴스 팩트를 읽기 편한 화면으로 설정합니다.</p><div class="profile-actions"><button id="profile-font-reset" type="button">기본값</button><button id="profile-font-save" class="primary" type="button">글꼴 설정 저장</button></div><p id="profile-status" class="profile-status" aria-live="polite"></p></div>
            </section>
            <section class="profile-section profile-referral-section profile-accordion"><button class="profile-section-head profile-accordion-trigger" type="button" aria-expanded="false" aria-controls="profile-referral-content"><span class="profile-accordion-title">친구 추천 코드 입력</span><span class="profile-accordion-meta"><b id="profile-coupon-balance">쿠폰 0건</b> <i aria-hidden="true"></i></span></button><div id="profile-referral-content" class="profile-accordion-content" hidden><p class="profile-referral-description">가입과 이메일 인증을 완료한 친구의 이메일을 입력하면 무료 글쓰기 쿠폰 10건을 드립니다.</p><div class="profile-referral-form"><input id="profile-referrer-email" type="email" maxlength="254" autocomplete="email" placeholder="추천 친구 이메일 주소"><button id="profile-referral-claim" type="button">10건 받기</button></div><p id="profile-referral-status" class="profile-referral-status" aria-live="polite"></p></div></section>
          </div><footer class="member-profile-footer"><button class="profile-admin-link" id="profile-open-admin" type="button" hidden>시스템 설정 및 회원 관리</button><button id="profile-logout" type="button"><span aria-hidden="true">↪</span><span>로그아웃</span></button></footer></section>`;
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
    function controls(root) { return { family: root.querySelector('#profile-font-family'), scale: root.querySelector('#profile-font-scale'), weight: root.querySelector('#profile-font-weight'), themes: [...root.querySelectorAll('input[name="profile-theme-mode"]')], status: root.querySelector('#profile-status') }; }
    function fill(root, pref) { const c = controls(root), p = { ...defaults, ...storedPreference(), ...(pref || {}) }; c.family.value=p.font_family;c.scale.value=p.font_scale;c.weight.value=p.font_weight;c.themes.forEach(input=>{input.checked=input.value===p.theme_mode;});applyPreference(p); }
    function read(root) { const c=controls(root); return { font_family:c.family.value,font_scale:c.scale.value,font_weight:c.weight.value,theme_mode:c.themes.find(input=>input.checked)?.value||'system' }; }
    function status(root, text, type='') { const el=controls(root).status;el.textContent=text;el.className=`profile-status${type?' '+type:''}`; }
    function renderNaverPublishingPreference(root, data) {
        const section = root.querySelector('#profile-naver-publishing-section');
        const input = root.querySelector('#profile-naver-blog-open-enabled');
        const enabled = data?.preference?.naver_blog_open_enabled !== false;
        input.checked = enabled;
        input.disabled = false;
        section.hidden = currentUser?.role !== 'admin';
        root.querySelector('#profile-naver-publishing-meta').textContent = enabled ? '사용 중' : '사용 안 함';
    }
    function naverPublishingStatus(root, text, type = '') {
        const element = root.querySelector('#profile-naver-publishing-status');
        element.textContent = text;
        element.className = `profile-integration-status${type ? ' ' + type : ''}`;
    }
    async function loadNaverPublishingPreference(root) {
        try {
            const data = await request('/api/auth/preferences/integrations');
            renderNaverPublishingPreference(root, data);
            naverPublishingStatus(root, '관리자 계정에 저장되어 다음 로그인에도 유지됩니다.');
        } catch (error) {
            root.querySelector('#profile-naver-publishing-section').hidden = currentUser?.role !== 'admin';
            root.querySelector('#profile-naver-blog-open-enabled').disabled = false;
            naverPublishingStatus(root, error.message, 'error');
        }
    }
    function renderReferralStatus(root, data) {
        const balance = Number(data?.balance || 0);
        const unlimited = Boolean(data?.unlimited);
        const claimed = Boolean(data?.claimed);
        const input = root.querySelector('#profile-referrer-email');
        const button = root.querySelector('#profile-referral-claim');
        root.querySelector('#profile-coupon-balance').textContent = unlimited ? '글쓰기 무제한' : `쿠폰 ${balance}건`;
        input.disabled = claimed;
        button.disabled = claimed;
        button.textContent = claimed ? '발급 완료' : '10건 받기';
        if (claimed) {
            const message = root.querySelector('#profile-referral-status');
            message.textContent = '추천 친구 등록을 완료했습니다. 계정당 한 번만 발급됩니다.';
            message.className = 'profile-referral-status success';
        }
    }
    async function loadReferralStatus(root) {
        try { renderReferralStatus(root, await request('/api/auth/referrals/status')); }
        catch (error) {
            const message = root.querySelector('#profile-referral-status');
            message.textContent = error.message;
            message.className = 'profile-referral-status error';
        }
    }
    function renderProfileUser(root, user) {
        const role = ({admin:'관리자',operator:'운영자',premium:'프로페셔널',member:'일반 회원'})[user?.role] || '일반 회원';
        root.querySelector('#profile-avatar').textContent=String(user?.nickname||user?.email||'U').charAt(0).toUpperCase();
        root.querySelector('#profile-nickname').textContent=user?.nickname||'사용자 정보 확인 중';
        root.querySelector('#profile-email').textContent=user?.email||'';
        root.querySelector('#profile-account-role').textContent=role;
        const planMeta = ({ admin: ['ADMIN', '관리자'], operator: ['OPERATOR', '운영자'], premium: ['PROFESSIONAL', '프로페셔널'], member: ['FREE', '무료 회원'] })[user?.role] || ['FREE', '무료 회원'];
        root.querySelector('#profile-plan-badge').textContent = planMeta[0];
        root.querySelector('#profile-plan-name').textContent = planMeta[1];
    }
    function close(root) { profileOpenRequestId+=1;root.classList.remove('is-open');root.setAttribute('aria-hidden','true');document.body.style.overflow=''; }
    async function open(root, suppliedUser) {
        const requestId=++profileOpenRequestId;
        currentUser=suppliedUser||null;
        const adminButton=root.querySelector('#profile-open-admin');
        const naverPublishingSection=root.querySelector('#profile-naver-publishing-section');
        adminButton.hidden=true;adminButton.setAttribute('aria-hidden','true');
        naverPublishingSection.hidden=true;
        renderProfileUser(root,currentUser);
        fill(root, storedPreference());
        root.querySelectorAll('.profile-accordion-trigger').forEach(trigger => {
            trigger.setAttribute('aria-expanded', 'false');
            trigger.closest('.profile-accordion')?.classList.remove('is-open');
            const content = root.querySelector(`#${trigger.getAttribute('aria-controls')}`);
            if (content) content.hidden = true;
        });
        root.classList.add('is-open');root.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';root.querySelector('.member-profile-close').focus();
        status(root,'계정 설정을 불러오는 중입니다.','pending');

        const sessionPromise=request('/api/auth/session');
        const photoPromise=currentUser?applyPhotoEverywhere(currentUser):Promise.resolve();
        const uiPromise=request('/api/auth/preferences/ui').then(data=>{if(requestId===profileOpenRequestId&&data.preference)fill(root,data.preference);}).catch(()=>{});
        const referralPromise=loadReferralStatus(root);
        let session;
        try { session=await sessionPromise; }
        catch (_) { session=null; }
        if(requestId!==profileOpenRequestId)return;
        if(!session?.authenticated){currentUser=null;adminButton.hidden=true;close(root);document.getElementById('member-auth-modal')?.classList.remove('hidden');return;}

        currentUser=session.user;
        renderProfileUser(root,currentUser);
        const adminVisible=currentUser.role==='admin'&&session.permissions?.['admin.members']!==false;
        adminButton.hidden=!adminVisible;adminButton.setAttribute('aria-hidden',String(!adminVisible));
        naverPublishingSection.hidden=currentUser.role!=='admin';
        const naverPublishingPromise=currentUser.role==='admin'?loadNaverPublishingPreference(root):Promise.resolve();
        const verifiedPhotoPromise=userPhotoKey(suppliedUser)===userPhotoKey(currentUser)?Promise.resolve():applyPhotoEverywhere(currentUser);
        await Promise.allSettled([photoPromise,verifiedPhotoPromise,uiPromise,referralPromise,naverPublishingPromise]);
        if(requestId===profileOpenRequestId)status(root,'','');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const root=build(); const preview=()=>applyPreference(read(root));
        root.querySelectorAll('.profile-accordion-trigger').forEach(trigger => trigger.addEventListener('click', () => {
            const expanded = trigger.getAttribute('aria-expanded') === 'true';
            const content = root.querySelector(`#${trigger.getAttribute('aria-controls')}`);
            trigger.setAttribute('aria-expanded', String(!expanded));
            trigger.closest('.profile-accordion')?.classList.toggle('is-open', !expanded);
            if (content) content.hidden = expanded;
        }));
        root.querySelectorAll('select,input[name="profile-theme-mode"]').forEach(el=>el.addEventListener('change',preview));
        root.querySelector('.member-profile-close').addEventListener('click',()=>close(root));root.addEventListener('click',e=>{if(e.target===root)close(root);});
        root.querySelector('#profile-naver-blog-open-enabled').addEventListener('change', async event => {
            const input = event.currentTarget;
            const enabled = input.checked;
            input.disabled = true;
            naverPublishingStatus(root, '설정을 저장하는 중입니다.', 'pending');
            try {
                const data = await request('/api/auth/preferences/integrations', {
                    method: 'PUT', body: JSON.stringify({ naver_blog_open_enabled: enabled })
                });
                renderNaverPublishingPreference(root, data);
                naverPublishingStatus(root, enabled ? '네이버 글쓰기 열기 버튼을 표시합니다.' : '네이버 글쓰기 열기 버튼을 숨겼습니다.', 'success');
                document.dispatchEvent(new CustomEvent('tc:naver-blog-open-preference-changed', { detail: data }));
            } catch (error) {
                input.checked = !enabled;
                input.disabled = false;
                naverPublishingStatus(root, error.message, 'error');
            }
        });
        root.querySelector('#profile-font-reset').addEventListener('click',()=>{fill(root,defaults);status(root,'기본 글꼴 설정으로 되돌렸습니다.');});
        root.querySelector('#profile-font-save').addEventListener('click',async()=>{const pref=read(root);applyPreference(pref);try{await request('/api/auth/preferences/ui',{method:'PUT',body:JSON.stringify(pref)});status(root,'화면 테마와 글꼴 설정을 계정에 저장했습니다.','success');}catch(e){const pending=e.status===404||e.message==='PROFILE_API_NOT_READY';status(root,pending?'현재 브라우저에 저장했습니다. 서버 재시작 후 계정과 동기화됩니다.':'현재 브라우저에 저장했습니다. 계정 동기화는 잠시 후 다시 시도해 주세요.',pending?'pending':'error');}});
        const photoInput = root.querySelector('#profile-photo-input');
        const photoMenu = root.querySelector('#profile-photo-menu');
        const avatarButton = root.querySelector('#profile-avatar');
        const closePhotoMenu = () => { photoMenu.hidden = true; avatarButton.setAttribute('aria-expanded', 'false'); };
        avatarButton.addEventListener('click', event => {
            event.stopPropagation();
            photoMenu.hidden = !photoMenu.hidden;
            avatarButton.setAttribute('aria-expanded', String(!photoMenu.hidden));
        });
        root.querySelector('#profile-photo-select').addEventListener('click', () => { closePhotoMenu(); photoInput.click(); });
        photoInput.addEventListener('change', async () => {
            const file = photoInput.files?.[0];
            if (!file || !currentUser) return;
            try {
                status(root, '프로필 사진을 처리하고 있습니다.');
                const blob = await resizeProfilePhoto(file);
                await savePhoto(currentUser, blob);
                await applyPhotoEverywhere(currentUser, blob);
                status(root, '프로필 사진을 현재 브라우저에 저장했습니다.', 'success');
            } catch (error) { status(root, error.message, 'error'); }
            finally { photoInput.value = ''; }
        });
        root.querySelector('#profile-photo-remove').addEventListener('click', async () => {
            if (!currentUser) return;
            closePhotoMenu();
            await removePhoto(currentUser).catch(() => {});
            await applyPhotoEverywhere(currentUser, null);
            status(root, '기본 프로필 이미지로 변경했습니다.', 'success');
        });
        document.addEventListener('click', event => { if (!event.target.closest('.profile-avatar-wrap')) closePhotoMenu(); });
        root.querySelector('#profile-open-persona').addEventListener('click',()=>{close(root);document.querySelector('.btn-ai-persona')?.click();});
        root.querySelector('#profile-open-instruction').addEventListener('click',()=>{
            close(root);
            document.getElementById('btn-open-system-instruction')?.click();
        });
        root.querySelector('#profile-open-admin').addEventListener('click',async()=>{
            const adminButton=root.querySelector('#profile-open-admin');
            if(adminButton.disabled||adminButton.dataset.navigationPending==='true')return;
            const originalText=adminButton.textContent;
            let navigationStarted=false;
            adminButton.disabled=true;
            adminButton.dataset.navigationPending='true';
            adminButton.setAttribute('aria-busy','true');
            adminButton.textContent='관리자 페이지 여는 중...';
            try {
                const session=await request('/api/auth/session');
                if(!session.authenticated||session.user?.role!=='admin'||session.permissions?.['admin.members']===false){
                    adminButton.hidden=true;
                    status(root,'관리자 권한이 없는 계정입니다.','error');
                    return;
                }
                navigationStarted=true;
                window.location.assign('/admin');
            } catch (_) {
                adminButton.hidden=true;
                status(root,'관리자 권한을 확인하지 못했습니다.','error');
            } finally {
                if(!navigationStarted){
                    adminButton.disabled=false;
                    delete adminButton.dataset.navigationPending;
                    adminButton.removeAttribute('aria-busy');
                    adminButton.textContent=originalText;
                }
            }
        });
        root.querySelector('#profile-logout').addEventListener('click', () => {
            currentUser=null;
            root.querySelector('#profile-open-admin').hidden=true;
            close(root);
            document.dispatchEvent(new CustomEvent('tc:logout-request'));
        });
        root.querySelector('#profile-payment-start').addEventListener('click', () => {
            const paymentStatus = root.querySelector('#profile-payment-status');
            paymentStatus.textContent = '결제 상품과 결제대행사 연결 후 이 버튼에서 안전한 결제창이 열립니다.';
            paymentStatus.className = 'profile-payment-status pending';
            document.dispatchEvent(new CustomEvent('tc:payment-request', { detail: { user: currentUser, plan: 'membership' } }));
        });
        root.querySelector('#profile-referral-claim').addEventListener('click', async () => {
            const input = root.querySelector('#profile-referrer-email');
            const button = root.querySelector('#profile-referral-claim');
            const message = root.querySelector('#profile-referral-status');
            const referrerEmail = input.value.trim();
            if (!referrerEmail) {
                message.textContent = '추천 친구 이메일 주소를 입력해 주세요.';
                message.className = 'profile-referral-status error';
                return;
            }
            button.disabled = true;
            button.textContent = '확인 중...';
            try {
                const data = await request('/api/auth/referrals/claim', {
                    method: 'POST', body: JSON.stringify({ referrer_email: referrerEmail })
                });
                renderReferralStatus(root, data);
                window.TrafficCatcherAuth?.refreshWritingCredits?.();
                message.textContent = data.message;
                message.className = 'profile-referral-status success';
            } catch (error) {
                button.disabled = false;
                button.textContent = '10건 받기';
                message.textContent = error.message;
                message.className = 'profile-referral-status error';
            }
        });
        document.addEventListener('tc:open-profile',e=>open(root,e.detail?.user));
        document.addEventListener('tc:member-authenticated', e => applyPhotoEverywhere(e.detail?.user));
        document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('is-open'))close(root);});
    });
    window.TrafficCatcherProfilePhoto = { load: loadPhoto, apply: applyPhotoEverywhere };
})();
