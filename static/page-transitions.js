(function () {
    'use strict';

    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let navigating = false;

    function revealPage() {
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
        revealPage();
    });
    window.TrafficCatcherNavigate = navigate;
    revealPage();
})();
