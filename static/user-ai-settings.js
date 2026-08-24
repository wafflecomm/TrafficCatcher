(function () {
    'use strict';
    const cache = { keyword: null, story: null };

    async function request(type, options = {}) {
        const response = await fetch(`/api/auth/preferences/system-instruction?type=${encodeURIComponent(type)}`, {
            credentials: 'include',
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        const payload = await response.json().catch(() => ({ status: 'error', message: '서버 응답을 확인할 수 없습니다.' }));
        if (!response.ok) {
            const error = new Error(payload.message || '개인 AI 설정 요청을 처리하지 못했습니다.');
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    async function loadInstruction(type = 'keyword', force = false) {
        type = type === 'story' ? 'story' : 'keyword';
        if (!force && cache[type] !== null) return cache[type];
        try {
            const payload = await request(type, { method: 'GET' });
            cache[type] = String(payload.instruction || '').trim();
        } catch (error) {
            if (error.status === 401) cache[type] = '';
            else throw error;
        }
        return cache[type];
    }

    async function saveInstruction(type, instruction) {
        type = type === 'story' ? 'story' : 'keyword';
        const payload = await request(type, { method: 'PUT', body: JSON.stringify({ instruction }) });
        cache[type] = String(payload.instruction || instruction).trim();
        return payload;
    }

    function clearCache() { cache.keyword = null; cache.story = null; }
    window.TrafficCatcherUserAI = { loadInstruction, saveInstruction, clearCache };
})();
