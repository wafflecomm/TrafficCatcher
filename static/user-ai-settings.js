(function () {
    'use strict';
    const instructionCache = { keyword: null, story: null };
    const instructionStateCache = { keyword: null, story: null };
    const profileCache = { keyword: null, story: null };
    const instructionRequests = { keyword: null, story: null };
    const profileRequests = { keyword: null, story: null };

    function normalizeType(type) { return type === 'story' ? 'story' : 'keyword'; }

    function cacheActiveInstructionState(type, payload = {}) {
        type = normalizeType(type);
        const active = Array.isArray(payload.profiles)
            ? payload.profiles.find(profile => Number(profile.is_active) === 1)
            : null;
        const state = active
            ? { instruction: String(active.instruction || '').trim(), profile_id: active.id || null, name: String(active.name || '').trim() }
            : { instruction: String(payload.instruction || '').trim(), profile_id: payload.profile_id || null, name: String(payload.name || '').trim() };
        instructionCache[type] = state.instruction;
        instructionStateCache[type] = state;
        return state;
    }

    async function request(path, options = {}) {
        const response = await fetch(path, {
            credentials: 'include',
            cache: 'no-store',
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        const payload = await response.json().catch(() => ({ status: 'error', message: '서버 응답을 확인할 수 없습니다.' }));
        if (!response.ok) {
            const error = new Error(payload.message || '개인 AI 설정 요청을 처리하지 못했습니다.');
            error.status = response.status;
            error.code = payload.code || '';
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    async function loadProfiles(type = 'keyword', force = false) {
        type = normalizeType(type);
        if (!force && profileCache[type]) return profileCache[type];
        if (profileRequests[type]) return profileRequests[type];
        profileRequests[type] = request(`/api/auth/preferences/instruction-profiles?type=${encodeURIComponent(type)}`)
            .then((payload) => {
                profileCache[type] = payload;
                cacheActiveInstructionState(type, payload);
                return payload;
            })
            .finally(() => { profileRequests[type] = null; });
        return profileRequests[type];
    }

    async function loadInstruction(type = 'keyword', force = false) {
        type = normalizeType(type);
        if (!force && instructionCache[type] !== null) return instructionCache[type];
        if (instructionRequests[type]) return instructionRequests[type];
        instructionRequests[type] = request(`/api/auth/preferences/system-instruction?type=${encodeURIComponent(type)}`)
            .then((payload) => {
                return cacheActiveInstructionState(type, payload).instruction;
            })
            .catch((error) => {
                if (error.status === 401) {
                    instructionCache[type] = '';
                    return '';
                }
                throw error;
            })
            .finally(() => { instructionRequests[type] = null; });
        return instructionRequests[type];
    }

    async function loadInstructionState(type = 'keyword', force = false) {
        type = normalizeType(type);
        await loadInstruction(type, force);
        return instructionStateCache[type] || { instruction: '', profile_id: null, name: '' };
    }

    async function createProfile(type, name, instruction, activate = true) {
        type = normalizeType(type);
        const payload = await request(`/api/auth/preferences/instruction-profiles?type=${encodeURIComponent(type)}`, {
            method: 'POST', body: JSON.stringify({ type, name, instruction, activate }),
        });
        profileCache[type] = payload;
        cacheActiveInstructionState(type, payload);
        return payload;
    }

    async function updateProfile(type, id, name, instruction, activate = true) {
        type = normalizeType(type);
        const payload = await request(`/api/auth/preferences/instruction-profiles?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, {
            method: 'PUT', body: JSON.stringify({ id, type, name, instruction, activate }),
        });
        profileCache[type] = payload;
        cacheActiveInstructionState(type, payload);
        return payload;
    }

    async function activateProfile(type, id) {
        type = normalizeType(type);
        const payload = await request(`/api/auth/preferences/instruction-profiles?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, {
            method: 'PUT', body: JSON.stringify({ id, type, action: 'activate' }),
        });
        profileCache[type] = payload;
        cacheActiveInstructionState(type, payload);
        return payload;
    }

    async function deactivateProfile(type, id) {
        type = normalizeType(type);
        const payload = await request(`/api/auth/preferences/instruction-profiles?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, {
            method: 'PUT', body: JSON.stringify({ id, type, action: 'deactivate' }),
        });
        profileCache[type] = payload;
        cacheActiveInstructionState(type, payload);
        return payload;
    }

    async function deleteProfile(type, id) {
        type = normalizeType(type);
        const payload = await request(`/api/auth/preferences/instruction-profiles?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        profileCache[type] = payload;
        cacheActiveInstructionState(type, payload);
        return payload;
    }

    async function saveInstruction(type, instruction) {
        type = normalizeType(type);
        const state = await loadProfiles(type, true);
        const active = (state.profiles || []).find(profile => Number(profile.is_active) === 1);
        if (active) return updateProfile(type, active.id, active.name, instruction, true);
        const name = type === 'story' ? '기본 메모·스토리 지침' : '기본 뉴스·키워드 지침';
        return createProfile(type, name, instruction, true);
    }

    function clearCache() {
        instructionCache.keyword = null;
        instructionCache.story = null;
        instructionStateCache.keyword = null;
        instructionStateCache.story = null;
        profileCache.keyword = null;
        profileCache.story = null;
        instructionRequests.keyword = null;
        instructionRequests.story = null;
        profileRequests.keyword = null;
        profileRequests.story = null;
    }

    window.TrafficCatcherUserAI = {
        loadInstruction, loadInstructionState, saveInstruction, loadProfiles, createProfile, updateProfile,
        activateProfile, deactivateProfile, deleteProfile, clearCache,
    };
})();
