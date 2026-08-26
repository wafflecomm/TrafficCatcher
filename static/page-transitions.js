(function () {
    'use strict';

    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STUDIO_PROGRESS_KEY = 'traffic_catcher_studio_navigation_loading';
    let navigating = false;
    let studioProgressTimer = null;

    function isStudioPath(url = window.location.href) {
        try { return /^\/studio\/?$/.test(new URL(url, window.location.href).pathname); }
        catch (_) { return false; }
    }

    function startStudioProgress() {
        clearTimeout(studioProgressTimer);
        root.classList.remove('studio-navigation-arriving');
        root.classList.add('studio-navigation-loading');
        root.setAttribute('aria-busy', 'true');
        try { sessionStorage.setItem(STUDIO_PROGRESS_KEY, '1'); } catch (_) { }
    }

    function stopStudioProgress(clearMarker = true) {
        clearTimeout(studioProgressTimer);
        root.classList.remove('studio-navigation-loading', 'studio-navigation-arriving');
        root.removeAttribute('aria-busy');
        if (clearMarker) {
            try { sessionStorage.removeItem(STUDIO_PROGRESS_KEY); } catch (_) { }
        }
    }

    function completeStudioProgressOnArrival() {
        let hasNavigationMarker = false;
        try { hasNavigationMarker = sessionStorage.getItem(STUDIO_PROGRESS_KEY) === '1'; } catch (_) { }
        if (!isStudioPath() || !hasNavigationMarker) return;
        root.classList.remove('studio-navigation-loading');
        root.classList.add('studio-navigation-arriving');
        root.setAttribute('aria-busy', 'true');
        studioProgressTimer = window.setTimeout(() => stopStudioProgress(true), 520);
    }

    function revealPage() {
        if (isStudioPath()) completeStudioProgressOnArrival();
        else stopStudioProgress(true);
        if (reducedMotion) {
            root.classList.add('page-transition-ready');
            return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
            root.classList.add('page-transition-ready');
        }));
    }

    function navigate(url) {
        if (!url || navigating) return;
        const target = new URL(url, window.location.href);
        if (target.href === window.location.href) return;
        if (isStudioPath(target.href)) startStudioProgress();
        if (reducedMotion) {
            window.location.href = target.href;
            return;
        }
        navigating = true;
        root.classList.add('page-transition-leaving');
        window.setTimeout(() => { window.location.href = target.href; }, 260);
    }

    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (link.target && link.target !== '_self') return;
        if (link.hasAttribute('download')) return;
        const target = new URL(link.href, window.location.href);
        if (target.origin !== window.location.origin) return;
        if (target.pathname === window.location.pathname && target.search === window.location.search && target.hash) return;
        event.preventDefault();
        navigate(target.href);
    });

    window.addEventListener('pageshow', () => {
        navigating = false;
        root.classList.remove('page-transition-leaving');
        if (!isStudioPath()) stopStudioProgress(true);
        revealPage();
    });
    window.TrafficCatcherNavigate = navigate;
    window.TrafficCatcherPageProgress = { startStudio: startStudioProgress, stop: stopStudioProgress };
    revealPage();
})();
