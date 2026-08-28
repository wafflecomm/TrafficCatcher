(function () {
    'use strict';

    const UI_KEY = 'traffic_catcher_ui_preference';
    const MODES = ['system', 'light', 'dark'];
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let preference = readPreference();

    function readUiPreference() {
        try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; }
        catch (_) { return {}; }
    }

    function readPreference() {
        const mode = String(readUiPreference().theme_mode || 'system');
        return MODES.includes(mode) ? mode : 'system';
    }

    function resolvedMode(mode) {
        return mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    }

    function persist(mode) {
        try {
            const stored = readUiPreference();
            stored.theme_mode = mode;
            localStorage.setItem(UI_KEY, JSON.stringify(stored));
        } catch (_) {}
    }

    function label(mode) {
        return ({ system: '시스템 설정', light: '라이트 모드', dark: '다크 모드' })[mode] || '시스템 설정';
    }

    function icon(mode) {
        if (mode === 'system') return 'monitor-cog';
        return mode === 'dark' ? 'moon' : 'sun';
    }

    function refreshButtons() {
        const resolved = resolvedMode(preference);
        const next = MODES[(MODES.indexOf(preference) + 1) % MODES.length];
        document.querySelectorAll('[data-theme-quick-toggle]').forEach((button) => {
            button.dataset.themePreference = preference;
            button.dataset.themeResolved = resolved;
            button.setAttribute('aria-label', `화면 테마: ${label(preference)}. 클릭하면 ${label(next)}로 변경`);
            button.title = `화면 테마 · ${label(preference)}`;
            button.innerHTML = `<i data-theme-icon data-lucide="${icon(preference)}"></i>`;
            window.TrafficCatcherIcons?.refresh(button);
        });
        document.querySelectorAll('input[name="profile-theme-mode"]').forEach((input) => {
            input.checked = input.value === preference;
        });
    }

    function apply(mode, options = {}) {
        const safeMode = MODES.includes(mode) ? mode : 'system';
        preference = safeMode;
        const resolved = resolvedMode(safeMode);
        document.documentElement.dataset.theme = resolved;
        document.documentElement.dataset.themePreference = safeMode;
        document.documentElement.style.colorScheme = resolved;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#4f37d8');
        if (options.persist !== false) persist(safeMode);
        refreshButtons();
        document.dispatchEvent(new CustomEvent('tc:theme-changed', { detail: { preference: safeMode, resolved } }));
        return resolved;
    }

    function cycle() {
        const next = MODES[(MODES.indexOf(preference) + 1) % MODES.length];
        apply(next);
        document.dispatchEvent(new CustomEvent('tc:theme-preference-preview', { detail: { theme_mode: next } }));
        const uiPreference = readUiPreference();
        fetch('/api/auth/preferences/ui', {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(uiPreference),
        }).catch(() => {});
    }

    function quickButton(slot) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `theme-quick-toggle theme-quick-toggle-${slot}`;
        button.dataset.themeQuickToggle = '';
        button.innerHTML = '<i data-theme-icon data-lucide="monitor-cog"></i>';
        button.addEventListener('click', cycle);
        return button;
    }

    function installQuickButtons() {
        const headerActions = document.querySelector('.header-actions');
        if (headerActions && !headerActions.querySelector('[data-theme-quick-toggle]')) {
            headerActions.prepend(quickButton('main'));
        }
        const studioProfile = document.getElementById('btn-studio-profile');
        const studioHeader = studioProfile?.closest('.modal-header');
        if (studioHeader && !studioHeader.querySelector('[data-theme-quick-toggle]')) {
            studioProfile.closest('.studio-profile-credit-wrap')?.before(quickButton('studio'));
        }
        refreshButtons();
    }

    window.TrafficCatcherTheme = {
        apply,
        cycle,
        current: () => ({ preference, resolved: resolvedMode(preference) }),
        syncPreference: (value) => apply(String(value || 'system')),
        installQuickButtons,
    };

    apply(preference, { persist: false });
    const systemChanged = () => { if (preference === 'system') apply('system', { persist: false }); };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', systemChanged);
    else media.addListener(systemChanged);

    document.addEventListener('DOMContentLoaded', () => {
        installQuickButtons();
        window.setTimeout(installQuickButtons, 0);
        window.setTimeout(installQuickButtons, 600);
    });
    document.addEventListener('tc:ui-preference-applied', (event) => {
        apply(String(event.detail?.theme_mode || 'system'));
    });
})();
