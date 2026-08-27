const SCHEDULES = Object.freeze({
    '0,30 0-14,21-23 * * *': {
        workflow: 'crawl_and_deploy.yml',
        label: '실시간 포털·방송 데이터',
        kst: '06:00~23:30 매 30분',
    },
    '30 1,5,9,13,21 * * *': {
        workflow: 'crawl_daily_discovery.yml',
        label: '시즌·문화·OTT 데이터',
        kst: '매일 06:30부터 4시간 간격(22:30까지)',
    },
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}

function schedulerConfig(env) {
    return {
        owner: String(env.GITHUB_OWNER || '').trim(),
        repository: String(env.GITHUB_REPOSITORY || '').trim(),
        ref: String(env.GITHUB_REF || 'main').trim() || 'main',
        token: String(env.GITHUB_ACTIONS_TOKEN || '').trim(),
    };
}

function assertSchedulerConfig(config) {
    if (!config.owner || !config.repository) {
        throw new Error('GitHub 저장소 설정이 없습니다.');
    }
    if (!config.token) {
        throw new Error('Cloudflare Secret GITHUB_ACTIONS_TOKEN이 설정되지 않았습니다.');
    }
}

async function dispatchWorkflow(config, schedule) {
    assertSchedulerConfig(config);
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`
        + `/actions/workflows/${encodeURIComponent(schedule.workflow)}/dispatches`;
    let lastError = '';

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'TrafficCatcher-Cloudflare-Scheduler',
                    'X-GitHub-Api-Version': '2026-03-10',
                },
                body: JSON.stringify({ ref: config.ref }),
                signal: AbortSignal.timeout(15000),
            });
        } catch (error) {
            lastError = String(error?.message || error || '네트워크 오류').slice(0, 300);
            if (attempt < 3) {
                await delay(attempt * 1500);
                continue;
            }
            throw new Error(`GitHub workflow_dispatch 요청 실패: ${lastError}`);
        }

        if (response.status === 200 || response.status === 204) {
            let runInfo = {};
            if (response.status === 200) {
                try {
                    runInfo = await response.json();
                } catch {
                    runInfo = {};
                }
            }
            console.log(JSON.stringify({
                event: 'workflow_dispatched',
                workflow: schedule.workflow,
                label: schedule.label,
                ref: config.ref,
                workflowRunId: runInfo.workflow_run_id || null,
                runUrl: runInfo.html_url || null,
                attempt,
                dispatchedAt: new Date().toISOString(),
            }));
            return {
                workflowRunId: runInfo.workflow_run_id || null,
                runUrl: runInfo.html_url || null,
            };
        }

        const responseText = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
        lastError = `HTTP ${response.status}${responseText ? ` · ${responseText}` : ''}`;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === 3) {
            throw new Error(`GitHub workflow_dispatch 요청 실패: ${lastError}`);
        }
        await delay(attempt * 1500);
    }

    throw new Error(`GitHub workflow_dispatch 요청 실패: ${lastError || '알 수 없는 오류'}`);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method !== 'GET' || !['/', '/health'].includes(url.pathname)) {
            return jsonResponse({ status: 'not_found' }, 404);
        }
        const config = schedulerConfig(env);
        return jsonResponse({
            status: config.token && config.owner && config.repository ? 'ready' : 'setup_required',
            scheduler: 'Cloudflare Cron Trigger',
            repositoryConfigured: Boolean(config.owner && config.repository),
            tokenConfigured: Boolean(config.token),
            ref: config.ref,
            schedules: Object.entries(SCHEDULES).map(([cron, item]) => ({
                cron,
                kst: item.kst,
                workflow: item.workflow,
            })),
        });
    },

    async scheduled(controller, env, ctx) {
        const schedule = SCHEDULES[controller.cron];
        if (!schedule) {
            console.warn(JSON.stringify({ event: 'unknown_cron', cron: controller.cron }));
            return;
        }
        const config = schedulerConfig(env);
        ctx.waitUntil(dispatchWorkflow(config, schedule).catch((error) => {
            console.error(JSON.stringify({
                event: 'workflow_dispatch_failed',
                workflow: schedule.workflow,
                label: schedule.label,
                cron: controller.cron,
                message: String(error?.message || error || '알 수 없는 오류').slice(0, 700),
                failedAt: new Date().toISOString(),
            }));
            throw error;
        }));
    },
};
