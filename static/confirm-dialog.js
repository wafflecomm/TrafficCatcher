(function () {
    'use strict';

    const queue = [];
    let active = false;

    function createDialog() {
        const backdrop = document.createElement('div');
        backdrop.className = 'tc-confirm-backdrop';
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <section class="tc-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tcConfirmTitle" aria-describedby="tcConfirmMessage">
                <div class="tc-confirm-icon" aria-hidden="true"></div>
                <h2 id="tcConfirmTitle" class="tc-confirm-title"></h2>
                <p id="tcConfirmMessage" class="tc-confirm-message"></p>
                <div class="tc-confirm-actions">
                    <button type="button" class="tc-confirm-button tc-confirm-cancel">취소</button>
                    <button type="button" class="tc-confirm-button tc-confirm-submit">확인</button>
                </div>
            </section>`;
        document.body.appendChild(backdrop);
        return backdrop;
    }

    function runNext() {
        if (active || !queue.length) return;
        active = true;
        const request = queue.shift();
        const options = request.options;
        const backdrop = document.querySelector('.tc-confirm-backdrop') || createDialog();
        const dialog = backdrop.querySelector('.tc-confirm-dialog');
        const title = backdrop.querySelector('.tc-confirm-title');
        const message = backdrop.querySelector('.tc-confirm-message');
        const cancelButton = backdrop.querySelector('.tc-confirm-cancel');
        const submitButton = backdrop.querySelector('.tc-confirm-submit');
        const previousFocus = document.activeElement;
        const type = ['info', 'warning', 'danger'].includes(options.type) ? options.type : 'info';

        dialog.dataset.type = type;
        title.textContent = options.title || '계속 진행할까요?';
        message.textContent = options.message || '';
        message.hidden = !options.message;
        cancelButton.textContent = options.cancelText || '취소';
        submitButton.textContent = options.confirmText || '확인';
        backdrop.hidden = false;
        document.body.classList.add('tc-confirm-open');
        requestAnimationFrame(() => backdrop.classList.add('is-open'));

        let finished = false;
        const finish = result => {
            if (finished) return;
            finished = true;
            backdrop.classList.remove('is-open');
            document.body.classList.remove('tc-confirm-open');
            document.removeEventListener('keydown', onKeydown, true);
            window.setTimeout(() => {
                backdrop.hidden = true;
                active = false;
                if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
                request.resolve(result);
                runNext();
            }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
        };
        const onKeydown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
                return;
            }
            if (event.key !== 'Tab') return;
            const buttons = [cancelButton, submitButton];
            const index = buttons.indexOf(document.activeElement);
            event.preventDefault();
            buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
        };

        cancelButton.onclick = () => finish(false);
        submitButton.onclick = () => finish(true);
        backdrop.onclick = event => {
            if (event.target === backdrop && type !== 'danger') finish(false);
        };
        document.addEventListener('keydown', onKeydown, true);
        window.setTimeout(() => submitButton.focus(), 20);
    }

    window.showConfirmDialog = function (options) {
        const normalized = typeof options === 'string' ? { message: options } : (options || {});
        return new Promise(resolve => {
            queue.push({ options: normalized, resolve });
            runNext();
        });
    };
})();
