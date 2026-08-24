(function () {
    'use strict';

    function initFactPanelCollapse() {
        const panel = document.getElementById('naver-top3-box');
        const header = panel?.querySelector('.naver-top3-header');
        const controls = panel?.querySelector('.naver-top3-controls');
        const studio = document.getElementById('ai-studio-modal');
        const preview = document.getElementById('blog-content-area');

        if (!panel || !header || !studio || !preview) return;

        function setCollapsed(collapsed) {
            if (collapsed) {
                const panelHeightBefore = panel.getBoundingClientRect().height;
                const panelStyle = window.getComputedStyle(panel);
                const headerHeight = header.getBoundingClientRect().height;
                const panelChromeHeight =
                    (parseFloat(panelStyle.paddingTop) || 0) +
                    (parseFloat(panelStyle.paddingBottom) || 0) +
                    (parseFloat(panelStyle.borderTopWidth) || 0) +
                    (parseFloat(panelStyle.borderBottomWidth) || 0);
                const collapsedPanelHeight = headerHeight + panelChromeHeight;
                const reclaimedHeight = Math.max(0, panelHeightBefore - collapsedPanelHeight);
                const renderedPreviewHeight = preview.getBoundingClientRect().height;
                const configuredPreviewHeight = parseFloat(window.getComputedStyle(preview).minHeight) || 380;
                const previewHeightBefore = renderedPreviewHeight || configuredPreviewHeight;
                const expandedPreviewHeight = Math.round(previewHeightBefore + reclaimedHeight);

                studio.style.setProperty('--fact-preview-expanded-height', `${expandedPreviewHeight}px`);
                studio.classList.add('facts-panel-collapsed');
                panel.classList.add('is-collapsed');
                header.setAttribute('aria-expanded', 'false');
                header.title = '클릭하여 검색 결과를 펼칩니다.';
            } else {
                studio.classList.remove('facts-panel-collapsed');
                studio.style.removeProperty('--fact-preview-expanded-height');
                panel.classList.remove('is-collapsed');
                header.setAttribute('aria-expanded', 'true');
                header.title = '클릭하여 검색 결과를 접습니다.';
            }
        }

        function togglePanel() {
            setCollapsed(!panel.classList.contains('is-collapsed'));
        }

        header.addEventListener('click', function (event) {
            if (event.target.closest('.naver-top3-controls')) return;
            togglePanel();
        });

        header.addEventListener('keydown', function (event) {
            if (event.target.closest('.naver-top3-controls')) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                togglePanel();
            }
        });

        controls?.addEventListener('click', function (event) {
            event.stopPropagation();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFactPanelCollapse, { once: true });
    } else {
        initFactPanelCollapse();
    }
})();
