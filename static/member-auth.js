(function () {
    'use strict';

    let resolveSessionReady;
    const sessionReady = new Promise(resolve => { resolveSessionReady = resolve; });
    const state = { challengeId: '', countdownTimer: null, user: null, permissions: {}, sessionChecked: false };
    const MEMBER_MEMORY_KEY = 'traffic_catcher_member_memory';

    function readMemberMemory() {
        try { return JSON.parse(localStorage.getItem(MEMBER_MEMORY_KEY) || '{}') || {}; }
        catch (_) { return {}; }
    }

    function rememberMember(user) {
        const email = String(user?.email || '').trim().toLowerCase();
        const nickname = String(user?.nickname || '').trim();
        if (!email || !nickname) return;
        const memory = readMemberMemory();
        memory.lastEmail = email;
        memory.nicknames = { ...(memory.nicknames || {}), [email]: nickname };
        localStorage.setItem(MEMBER_MEMORY_KEY, JSON.stringify(memory));
    }

    function fillRememberedMember(force = false) {
        const el = elements();
        const memory = readMemberMemory();
        if (force && !el.email.value && memory.lastEmail) el.email.value = memory.lastEmail;
        const email = String(el.email.value || '').trim().toLowerCase();
        const nickname = memory.nicknames?.[email];
        if (nickname && (force || !el.nickname.value.trim())) el.nickname.value = nickname;
    }

    function elements() {
        return {
            open: document.getElementById('btn-member-auth'),
            modal: document.getElementById('member-auth-modal'),
            close: document.getElementById('member-auth-close'),
            form: document.getElementById('member-auth-form'),
            account: document.getElementById('member-account-view'),
            email: document.getElementById('member-email'),
            nickname: document.getElementById('member-nickname'),
            otpGroup: document.getElementById('member-otp-group'),
            otp: document.getElementById('member-otp'),
            requestOtp: document.getElementById('btn-request-member-otp'),
            verifyOtp: document.getElementById('btn-verify-member-otp'),
            resend: document.getElementById('btn-resend-member-otp'),
            logout: document.getElementById('btn-member-logout'),
            status: document.getElementById('member-auth-status'),
            accountNickname: document.getElementById('member-account-nickname'),
            accountEmail: document.getElementById('member-account-email'),
            studioProfile: document.getElementById('btn-studio-profile'),
        };
    }

    async function api(path, options = {}) {
        const response = await fetch(path, {
            credentials: 'include',
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        const payload = await response.json().catch(() => ({ status: 'error', message: '서버 응답을 확인할 수 없습니다.' }));
        if (!response.ok) {
            const error = new Error(payload.message || '요청을 처리하지 못했습니다.');
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function setStatus(message = '', type = '') {
        const el = elements().status;
        if (!el) return;
        el.textContent = message;
        el.className = `member-auth-status${type ? ` ${type}` : ''}`;
    }

    function updateRestrictedSections(authenticated, extendedAllowed = authenticated) {
        document.body.classList.toggle('member-is-authenticated', authenticated);
        document.body.classList.toggle('member-is-anonymous', !authenticated);
        document.querySelectorAll('.member-restricted-section').forEach(section => {
            const locked = !authenticated || !extendedAllowed;
            section.classList.toggle('is-member-locked', locked);
            section.setAttribute('aria-disabled', String(locked));
            const toggle = section.querySelector('.section-collapse-toggle[aria-controls]');
            const content = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
            if (!toggle || !content) return;
            const label = toggle.querySelector('.section-collapse-label');
            if (locked) {
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-disabled', 'true');
                toggle.title = authenticated ? '현재 회원 등급에는 확장 대시보드 권한이 없습니다.' : '로그인 후 이용할 수 있습니다.';
                content.hidden = true;
                section.classList.remove('is-expanded');
                if (label) label.textContent = authenticated ? '권한 없음' : '로그인 필요';
            } else {
                toggle.removeAttribute('aria-disabled');
                toggle.setAttribute('aria-expanded', 'true');
                toggle.title = '접기';
                content.hidden = false;
                section.classList.add('is-expanded');
                if (label) label.textContent = '접기';
            }
        });
    }

    function showAuthenticated(user, permissions = {}) {
        const el = elements();
        state.user = user || null;
        state.permissions = permissions || {};
        rememberMember(user);
        window.TrafficCatcherUserAI?.clearCache?.();
        el.form.hidden = true;
        el.account.hidden = false;
        el.accountNickname.textContent = user.nickname;
        el.accountEmail.textContent = user.email;
        const initial = String(user.nickname || user.email || 'U').trim().charAt(0).toUpperCase();
        el.open.innerHTML = `<span class="member-avatar-thumb" data-member-avatar aria-hidden="true">${initial}</span><span>${user.nickname}</span>`;
        el.open.classList.add('is-authenticated');
        el.open.classList.remove('needs-attention');
        updateRestrictedSections(true, state.permissions?.['dashboard.extended'] !== false);
        if (el.studioProfile) {
            el.studioProfile.textContent = initial;
            el.studioProfile.classList.add('is-authenticated');
            el.studioProfile.title = `${user.nickname} · 내 프로필`;
            el.studioProfile.setAttribute('aria-label', `${user.nickname} 사용자 프로필`);
        }
        document.dispatchEvent(new CustomEvent('tc:member-authenticated', { detail: { user } }));
        setStatus('이메일 인증이 완료된 계정입니다.', 'success');
    }

    function showAnonymous() {
        const el = elements();
        state.user = null;
        window.TrafficCatcherUserAI?.clearCache?.();
        state.challengeId = '';
        el.form.hidden = false;
        el.account.hidden = true;
        el.otpGroup.hidden = true;
        el.verifyOtp.hidden = true;
        el.resend.hidden = true;
        el.requestOtp.hidden = false;
        el.email.disabled = false;
        el.nickname.disabled = false;
        el.otp.value = '';
        el.open.innerHTML = '<span aria-hidden="true">👤</span><span>로그인</span>';
        el.open.classList.remove('is-authenticated');
        el.open.classList.add('needs-attention');
        updateRestrictedSections(false);
        if (el.studioProfile) {
            el.studioProfile.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>';
            el.studioProfile.classList.remove('is-authenticated');
            el.studioProfile.classList.remove('has-profile-photo');
            el.studioProfile.style.removeProperty('background-image');
            el.studioProfile.title = '로그인 · 사용자 프로필';
            el.studioProfile.setAttribute('aria-label', '로그인 및 사용자 프로필');
        }
        document.dispatchEvent(new CustomEvent('tc:member-anonymous'));
        setStatus('이메일과 닉네임만으로 가입하고 로그인할 수 있습니다.');
        fillRememberedMember(true);
    }

    function requireLogin(message = '로그인 하셔야 AI 글쓰기를 사용할 수 있습니다.') {
        if (state.user) return true;
        const el = elements();
        setStatus(message, 'error');
        el.modal?.classList.remove('hidden');
        el.open?.classList.remove('auth-nudge');
        void el.open?.offsetWidth;
        el.open?.classList.add('auth-nudge');
        window.showToastNotification?.(`⚠️ ${message}`);
        return false;
    }

    window.TrafficCatcherAuth = {
        isAuthenticated: () => Boolean(state.user),
        isSessionChecked: () => state.sessionChecked,
        whenReady: () => sessionReady,
        requireLogin,
        getUser: () => state.user ? { ...state.user } : null,
        hasPermission: (key) => Boolean(state.permissions?.[key]),
        getPermissions: () => ({ ...state.permissions }),
    };

    function setBusy(button, busy, busyLabel) {
        if (!button) return;
        if (busy) {
            button.dataset.originalText = button.textContent;
            button.textContent = busyLabel;
        } else if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
        }
        button.disabled = busy;
    }

    function beginCountdown(seconds) {
        const el = elements();
        clearInterval(state.countdownTimer);
        let remaining = seconds;
        el.resend.hidden = false;
        el.resend.disabled = true;
        el.resend.textContent = `다시 받기 (${remaining}초)`;
        state.countdownTimer = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(state.countdownTimer);
                el.resend.disabled = false;
                el.resend.textContent = '인증번호 다시 받기';
                return;
            }
            el.resend.textContent = `다시 받기 (${remaining}초)`;
        }, 1000);
    }

    async function refreshSession() {
        try {
            const payload = await api('/api/auth/session', { method: 'GET', headers: {} });
            if (payload.authenticated && payload.user) showAuthenticated(payload.user, payload.permissions || {});
            else showAnonymous();
        } catch (_) {
            showAnonymous();
        } finally {
            if (!state.sessionChecked) {
                state.sessionChecked = true;
                resolveSessionReady();
            }
        }
    }

    async function requestOtp() {
        const el = elements();
        const email = el.email.value.trim();
        const nickname = el.nickname.value.trim();
        if (!email || !nickname) {
            setStatus('이메일과 닉네임을 모두 입력해 주세요.', 'error');
            return;
        }
        setBusy(el.requestOtp, true, '발송 중...');
        setBusy(el.resend, true, '발송 중...');
        try {
            const payload = await api('/api/auth/request-otp', {
                method: 'POST',
                body: JSON.stringify({ email, nickname }),
            });
            state.challengeId = payload.challenge_id;
            el.email.disabled = true;
            el.nickname.disabled = true;
            el.otpGroup.hidden = false;
            el.verifyOtp.hidden = false;
            el.requestOtp.hidden = true;
            if (payload.delivery === 'console' && /^\d{6}$/.test(payload.development_otp || '')) {
                el.otp.value = payload.development_otp;
            }
            setStatus(payload.message, 'success');
            el.otp.focus();
            beginCountdown(60);
        } catch (error) {
            setStatus(error.message, 'error');
            if (error.payload?.retry_after) beginCountdown(error.payload.retry_after);
        } finally {
            setBusy(el.requestOtp, false);
            if (!state.countdownTimer) setBusy(el.resend, false);
        }
    }

    async function verifyOtp() {
        const el = elements();
        const otp = el.otp.value.replace(/\D/g, '');
        if (!state.challengeId || otp.length !== 6) {
            setStatus('6자리 인증번호를 입력해 주세요.', 'error');
            return;
        }
        setBusy(el.verifyOtp, true, '확인 중...');
        try {
            const payload = await api('/api/auth/verify-otp', {
                method: 'POST',
                body: JSON.stringify({ challenge_id: state.challengeId, otp }),
            });
            clearInterval(state.countdownTimer);
            showAuthenticated(payload.user);
        } catch (error) {
            setStatus(error.message, 'error');
            el.otp.select();
        } finally {
            setBusy(el.verifyOtp, false);
        }
    }

    async function logout() {
        const el = elements();
        setBusy(el.logout, true, '로그아웃 중...');
        try {
            await api('/api/auth/logout', { method: 'POST', body: '{}' });
            showAnonymous();
        } catch (error) {
            setStatus(error.message, 'error');
        } finally {
            setBusy(el.logout, false);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const el = elements();
        if (!el.open || !el.modal) return;
        updateRestrictedSections(false);
        el.open.addEventListener('click', () => {
            if (state.user) document.dispatchEvent(new CustomEvent('tc:open-profile', { detail: { user: state.user } }));
            else el.modal.classList.remove('hidden');
        });
        el.email.addEventListener('input', () => fillRememberedMember(false));
        el.email.addEventListener('change', () => fillRememberedMember(false));
        document.addEventListener('click', (event) => {
            const aiEntry = event.target.closest('#btn-ai-studio-open, .btn-ai-write, .btn-cross-ai-write');
            if (!aiEntry || !state.sessionChecked) return;
            if (state.user) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            requireLogin();
        }, true);
        document.addEventListener('click', (event) => {
            const lockedSection = event.target.closest('.member-restricted-section.is-member-locked');
            if (!lockedSection) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            requireLogin('로그인 후 전체 트렌드 데이터를 확인할 수 있습니다.');
        }, true);
        el.studioProfile?.addEventListener('click', () => {
            if (state.user) document.dispatchEvent(new CustomEvent('tc:open-profile', { detail: { user: state.user } }));
            else el.modal.classList.remove('hidden');
        });
        el.close.addEventListener('click', () => el.modal.classList.add('hidden'));
        el.modal.addEventListener('click', (event) => {
            if (event.target === el.modal) el.modal.classList.add('hidden');
        });
        el.requestOtp.addEventListener('click', requestOtp);
        el.resend.addEventListener('click', requestOtp);
        el.verifyOtp.addEventListener('click', verifyOtp);
        el.logout.addEventListener('click', logout);
        document.addEventListener('tc:logout-request', logout);
        document.addEventListener('tc:auth-session-invalid', () => {
            showAnonymous();
            requireLogin('로그인 하셔야 AI 글쓰기를 사용할 수 있습니다.');
        });
        el.otp.addEventListener('input', () => { el.otp.value = el.otp.value.replace(/\D/g, '').slice(0, 6); });
        el.otp.addEventListener('keydown', (event) => { if (event.key === 'Enter') verifyOtp(); });
        refreshSession();
    });
})();

