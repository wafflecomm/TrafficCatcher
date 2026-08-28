import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const worker = workerModule.default;

const notReady = await worker.fetch(new Request('https://scheduler.example/health'), {
    GITHUB_OWNER: 'wafflecomm',
    GITHUB_REPOSITORY: 'TrafficCatcher',
    GITHUB_REF: 'main',
});
assert.equal(notReady.status, 200);
assert.equal((await notReady.json()).status, 'setup_required');

const ready = await worker.fetch(new Request('https://scheduler.example/health'), {
    GITHUB_OWNER: 'wafflecomm',
    GITHUB_REPOSITORY: 'TrafficCatcher',
    GITHUB_REF: 'main',
    GITHUB_ACTIONS_TOKEN: 'test-token',
});
const readyPayload = await ready.json();
assert.equal(readyPayload.status, 'ready');
assert.equal(readyPayload.tokenConfigured, true);
assert.equal(JSON.stringify(readyPayload).includes('test-token'), false);
assert.equal(readyPayload.schedules.length, 2);

const originalFetch = globalThis.fetch;
const dispatched = [];
globalThis.fetch = async (url, options) => {
    dispatched.push({ url: String(url), options });
    return Response.json({
        workflow_run_id: 123456,
        html_url: 'https://github.com/wafflecomm/TrafficCatcher/actions/runs/123456',
    });
};

try {
    const waitUntilPromises = [];
    await worker.scheduled(
        { cron: '*/10 * * * *' },
        {
            GITHUB_OWNER: 'wafflecomm',
            GITHUB_REPOSITORY: 'TrafficCatcher',
            GITHUB_REF: 'main',
            GITHUB_ACTIONS_TOKEN: 'test-token',
        },
        { waitUntil: (promise) => waitUntilPromises.push(promise) },
    );
    await Promise.all(waitUntilPromises);

    assert.equal(dispatched.length, 1);
    assert.equal(
        dispatched[0].url,
        'https://api.github.com/repos/wafflecomm/TrafficCatcher/actions/workflows/crawl_and_deploy.yml/dispatches',
    );
    assert.equal(dispatched[0].options.method, 'POST');
    assert.equal(dispatched[0].options.headers.Authorization, 'Bearer test-token');
    assert.equal(dispatched[0].options.headers['X-GitHub-Api-Version'], '2026-03-10');
    assert.deepEqual(JSON.parse(dispatched[0].options.body), { ref: 'main' });

    await worker.scheduled(
        { cron: '0 0 * * *' },
        {},
        { waitUntil: () => assert.fail('알 수 없는 Cron은 실행 요청을 만들면 안 됩니다.') },
    );
    assert.equal(dispatched.length, 1);
} finally {
    globalThis.fetch = originalFetch;
}

console.log('Cloudflare Scheduler Worker tests passed.');
