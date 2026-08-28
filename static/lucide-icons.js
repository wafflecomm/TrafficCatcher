(function () {
    'use strict';

    function refreshLucideIcons(root) {
        if (!window.lucide || typeof window.lucide.createIcons !== 'function') return false;
        window.lucide.createIcons({
            attrs: {
                'aria-hidden': 'true',
                focusable: 'false'
            },
            nameAttr: 'data-lucide',
            root: root || document
        });
        return true;
    }

    function setIconContent(element, iconName, label) {
        if (!element) return;
        const safeName = /^[a-z0-9-]+$/.test(String(iconName || '')) ? iconName : 'circle';
        element.replaceChildren();
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', safeName);
        const text = document.createElement('span');
        text.textContent = String(label || '');
        element.append(icon, text);
        refreshLucideIcons(element);
    }

    window.TrafficCatcherIcons = Object.freeze({
        refresh: refreshLucideIcons,
        set: setIconContent
    });

    function initialize() {
        if (refreshLucideIcons()) return;
        window.setTimeout(refreshLucideIcons, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
