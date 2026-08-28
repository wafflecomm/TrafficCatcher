(function () {
    'use strict';

    const CLOSE_MS = 440;

    function init() {
        if (!/^\/studio\/?$/.test(window.location.pathname)) return;
        const systemModal = document.getElementById('system-instruction-admin-modal');
        const systemOpen = document.getElementById('btn-open-system-instruction');
        const systemClose = document.getElementById('btn-close-system-instruction');
        const apiToggle = document.getElementById('btn-toggle-api-key');
        const apiBody = document.getElementById('gemini-key-body');
        const apiSettingsEnabled = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const instructionDrop = document.getElementById('system-instruction-file-drop');
        const instructionFileInput = document.getElementById('system-instruction-file-input');
        const instructionImportButton = document.getElementById('btn-import-system-instruction-file');
        const instructionEditor = document.getElementById('system-instruction-editor');
        const instructionStatus = document.getElementById('system-instruction-admin-status');
        let systemTimer = null;
        let apiTimer = null;

        const closeSystem = () => {
            if (!systemModal || systemModal.classList.contains('hidden')) return;
            systemModal.classList.add('is-closing');
            clearTimeout(systemTimer);
            systemTimer = setTimeout(() => {
                systemModal.classList.add('hidden');
                systemModal.classList.remove('is-closing', 'system-side-panel');
            }, CLOSE_MS);
        };

        systemOpen?.addEventListener('click', () => {
            clearTimeout(systemTimer);
            systemModal?.classList.remove('is-closing');
            systemModal?.classList.add('system-side-panel');
        }, true);
        systemClose?.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeSystem();
        }, true);
        systemModal?.addEventListener('click', event => {
            if (event.target !== systemModal) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            closeSystem();
        }, true);

        const importInstructionFile = file => {
            if (!file || !instructionEditor) return;
            if (!/\.(md|txt)$/i.test(file.name)) {
                if (instructionStatus) instructionStatus.textContent = '.md 또는 .txt 파일만 불러올 수 있습니다.';
                return;
            }
            if (file.size > 200000) {
                if (instructionStatus) instructionStatus.textContent = '파일 크기는 200KB를 초과할 수 없습니다.';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                instructionEditor.value = String(reader.result || '').slice(0, 20000);
                instructionEditor.dispatchEvent(new Event('input', { bubbles: true }));
                if (instructionStatus) instructionStatus.textContent = `${file.name} 파일을 편집기에 불러왔습니다. 검토 후 저장해 주세요.`;
            };
            reader.onerror = () => { if (instructionStatus) instructionStatus.textContent = '파일을 읽지 못했습니다.'; };
            reader.readAsText(file, 'utf-8');
        };
        instructionImportButton?.addEventListener('click', event => {
            event.stopPropagation();
            instructionFileInput?.click();
        });
        instructionFileInput?.addEventListener('change', () => importInstructionFile(instructionFileInput.files?.[0]));
        instructionDrop?.addEventListener('dragover', event => {
            event.preventDefault();
            instructionDrop.classList.add('is-dragover');
        });
        instructionDrop?.addEventListener('dragleave', () => instructionDrop.classList.remove('is-dragover'));
        instructionDrop?.addEventListener('drop', event => {
            event.preventDefault();
            instructionDrop.classList.remove('is-dragover');
            importInstructionFile(event.dataTransfer?.files?.[0]);
        });
        instructionDrop?.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                instructionFileInput?.click();
            }
        });

        if (apiSettingsEnabled && apiBody && !document.getElementById('api-side-panel-header')) {
            const header = document.createElement('div');
            header.id = 'api-side-panel-header';
            header.className = 'api-side-panel-header';
            header.innerHTML = '<h3 class="ui-icon-heading"><i data-lucide="settings"></i><span>API 연동 설정</span></h3><button type="button" class="api-side-panel-close" aria-label="API 연동 설정 닫기">&times;</button>';
            apiBody.prepend(header);
            window.TrafficCatcherIcons?.refresh(header);
        }
        // 스튜디오 본문은 자체 stacking context(z-index: 1)를 사용하므로,
        // fixed 패널을 body 직속으로 이동해 배경 오버레이보다 위에서 입력받게 한다.
        if (!apiSettingsEnabled) return;
        if (apiBody && apiBody.parentElement !== document.body) document.body.append(apiBody);
        let apiBackdrop = document.getElementById('api-side-panel-backdrop');
        if (!apiBackdrop) {
            apiBackdrop = document.createElement('div');
            apiBackdrop.id = 'api-side-panel-backdrop';
            apiBackdrop.className = 'api-side-panel-backdrop hidden';
            document.body.append(apiBackdrop);
        }

        const closeApi = () => {
            if (!apiBody || !apiBody.classList.contains('is-open')) return;
            apiBody.classList.add('is-closing');
            apiBackdrop.classList.add('is-closing');
            clearTimeout(apiTimer);
            apiTimer = setTimeout(() => {
                apiBody.classList.remove('is-open', 'is-closing');
                apiBody.style.display = 'none';
                apiBackdrop.classList.add('hidden');
                apiBackdrop.classList.remove('is-closing');
                apiToggle?.setAttribute('aria-expanded', 'false');
            }, CLOSE_MS);
        };
        const openApi = () => {
            clearTimeout(apiTimer);
            apiBody.style.display = 'block';
            apiBody.classList.remove('is-closing');
            apiBody.classList.add('is-open');
            apiBackdrop.classList.remove('hidden', 'is-closing');
            apiToggle?.setAttribute('aria-expanded', 'true');
        };

        apiToggle?.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            apiBody?.classList.contains('is-open') ? closeApi() : openApi();
        }, true);
        apiBody?.querySelector('.api-side-panel-close')?.addEventListener('click', closeApi);
        apiBackdrop.addEventListener('click', closeApi);
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
