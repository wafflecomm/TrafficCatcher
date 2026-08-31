(function () {
    'use strict';

    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STUDIO_PROGRESS_KEY = 'traffic_catcher_studio_navigation_loading';
    let navigating = false;
    let studioProgressTimer = null;
    let viewportFrame = null;
    let trackingViewport = false;
    const visualViewport = window.visualViewport;

    function syncStudioViewport() {
        viewportFrame = null;
        const width = visualViewport?.width > 0 ? visualViewport.width : root.clientWidth;
        const left = Math.max(0, visualViewport?.offsetLeft || 0);
        const top = Math.max(0, visualViewport?.offsetTop || 0);
        root.style.setProperty('--studio-viewport-width', width + 'px');
        root.style.setProperty('--studio-viewport-left', left + 'px');
        root.style.setProperty('--studio-viewport-top', top + 'px');
    }

    function queueStudioViewport() {
        if (trackingViewport && viewportFrame === null) {
            viewportFrame = requestAnimationFrame(syncStudioViewport);
        }
    }

    function trackStudioViewport() {
        if (viewportFrame !== null) cancelAnimationFrame(viewportFrame);
        syncStudioViewport();
        if (trackingViewport) return;
        trackingViewport = true;
        window.addEventListener('resize', queueStudioViewport);
        window.addEventListener('orientationchange', queueStudioViewport);
        visualViewport?.addEventListener('resize', queueStudioViewport);
        visualViewport?.addEventListener('scroll', queueStudioViewport);
    }

    function untrackStudioViewport() {
        trackingViewport = false;
        if (viewportFrame !== null) cancelAnimationFrame(viewportFrame);
        viewportFrame = null;
        window.removeEventListener('resize', queueStudioViewport);
        window.removeEventListener('orientationchange', queueStudioViewport);
        visualViewport?.removeEventListener('resize', queueStudioViewport);
        visualViewport?.removeEventListener('scroll', queueStudioViewport);
        ['width', 'left', 'top'].forEach(key => root.style.removeProperty('--studio-viewport-' + key));
    }

    function isStudioPath(url = window.location.href) {
        try { return /^\/studio\/?$/.test(new URL(url, window.location.href).pathname); }
        catch (_) { return false; }
    }

    function startStudioProgress() {
        clearTimeout(studioProgressTimer);
        trackStudioViewport();
        root.classList.remove('studio-navigation-arriving');
        root.classList.add('studio-navigation-loading');
        root.setAttribute('aria-busy', 'true');
        try { sessionStorage.setItem(STUDIO_PROGRESS_KEY, '1'); } catch (_) { }
    }

    function stopStudioProgress(clearMarker = true) {
        clearTimeout(studioProgressTimer);
        untrackStudioViewport();
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
        clearTimeout(studioProgressTimer);
        trackStudioViewport();
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
        navigating = true;
        if (isStudioPath(target.href)) startStudioProgress();
        if (reducedMotion) {
            window.location.href = target.href;
            return;
        }
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

    window.addEventListener('pagehide', () => stopStudioProgress(false));
    window.addEventListener('pageshow', event => {
        navigating = false;
        root.classList.remove('page-transition-leaving');
        if (event.persisted || !isStudioPath()) stopStudioProgress(true);
        revealPage();
    });
    window.TrafficCatcherNavigate = navigate;
    window.TrafficCatcherPageProgress = { startStudio: startStudioProgress, stop: stopStudioProgress };
    revealPage();
})();
