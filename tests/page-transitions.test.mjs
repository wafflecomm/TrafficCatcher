import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../static/page-transitions.js', import.meta.url), 'utf8');
function environment({ pathname = '/', marker = false, viewport = true, reduced = false } = {}) {
    const classes = new Set(), properties = new Map(), attributes = new Map();
    const frames = new Map(), timers = new Map(), storage = new Map();
    let sequence = 0;
    const events = () => {
        const listeners = new Map();
        return {
            addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
            removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
            emit(name, event = {}) { for (const fn of [...(listeners.get(name) || [])]) fn(event); },
            count(name) { return listeners.get(name)?.size || 0; }
        };
    };
    const root = { clientWidth: 690, classList: {
        add(...names) { names.forEach(n => classes.add(n)); },
        remove(...names) { names.forEach(n => classes.delete(n)); }
    }, style: { setProperty(k, v) { properties.set(k, v); }, removeProperty(k) { properties.delete(k); } },
        setAttribute(k, v) { attributes.set(k, v); }, removeAttribute(k) { attributes.delete(k); } };
    const visualViewport = viewport ? Object.assign(events(), { width: 690, offsetLeft: 0, offsetTop: 0 }) : undefined;
    const window = Object.assign(events(), {
        visualViewport, innerWidth: 1400, location: { href: 'https://example.test' + pathname },
        matchMedia: () => ({ matches: reduced }),
        setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay }); return id; }
    });
    const key = 'traffic_catcher_studio_navigation_loading';
    if (marker) storage.set(key, '1');
    const context = vm.createContext({ window, document: Object.assign(events(), { documentElement: root }), URL,
        sessionStorage: { getItem:k => storage.get(k), setItem:(k,v) => storage.set(k,v), removeItem:k => storage.delete(k) },
        clearTimeout:id => timers.delete(id),
        requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; },
        cancelAnimationFrame:id => frames.delete(id)
    });
    vm.runInContext(source, context);
    function flushFrames() { for (let i=0; frames.size && i<10; i++) { const pending=[...frames]; frames.clear(); pending.forEach(([,fn])=>fn()); } }
    flushFrames();
    return { window, visualViewport, root, properties, attributes, classes, storage, key, frames, timers, flushFrames,
        progress:window.TrafficCatcherPageProgress };
}

test('uses visible viewport, not expanded layout width; tracks fold/zoom/scroll changes', () => {
    const e=environment();
    e.progress.startStudio();
    assert.equal(e.properties.get('--studio-viewport-width'), '690px');
    Object.assign(e.visualViewport, { width: 420, offsetLeft: 90, offsetTop: 32 });
    for (let i=0; i<20; i++) { e.visualViewport.emit('resize'); e.visualViewport.emit('scroll'); }
    assert.equal(e.frames.size, 1, 'events are coalesced into one animation frame');
    e.flushFrames();
    assert.deepEqual([...e.properties.values()], ['420px', '90px', '32px']);
    Object.assign(e.visualViewport, { width: 829, offsetLeft: 0, offsetTop: 0 });
    e.window.emit('orientationchange');
    e.flushFrames();
    assert.equal(e.properties.get('--studio-viewport-width'), '829px');
});

test('repeated start is idempotent; failure/stop removes pending work and listeners', () => {
    const e=environment();
    e.progress.startStudio();
    e.visualViewport.emit('resize');
    e.progress.startStudio();
    assert.equal(e.frames.size, 0);
    assert.equal(e.visualViewport.count('resize'), 1);
    assert.equal(e.window.count('resize'), 1);
    e.visualViewport.emit('scroll');
    e.progress.stop();
    assert.equal(e.frames.size, 0);
    assert.equal(e.properties.size, 0);
    assert.equal(e.visualViewport.count('resize'), 0);
    assert.equal(e.visualViewport.count('scroll'), 0);
    assert.equal(e.window.count('orientationchange'), 0);
    assert.equal(e.attributes.has('aria-busy'), false);
    assert.equal(e.storage.has(e.key), false);
});

test('pagehide preserves destination marker, BFCache clears stale progress on both pages', () => {
    for (const pathname of ['/', '/studio']) {
        const e=environment({ pathname });
        e.progress.startStudio();
        e.window.emit('pagehide');
        assert.equal(e.storage.get(e.key), '1');
        assert.equal(e.properties.size, 0);
        e.window.emit('pageshow', { persisted: true });
        e.flushFrames();
        assert.equal(e.storage.has(e.key), false);
        assert.equal(e.classes.has('studio-navigation-arriving'), false);
        assert.equal(e.classes.has('studio-navigation-loading'), false);
    }
});

test('arrival completes after 520ms and cleans tracking even under reduced motion', () => {
    for (const reduced of [false,true]) {
        const e=environment({ pathname:'/studio', marker:true, reduced });
        e.window.emit('pageshow', { persisted:false });
        assert.equal(e.classes.has('studio-navigation-arriving'), true);
        assert.equal(e.timers.size, 1);
        const timer=[...e.timers.values()][0];
        assert.equal(timer.delay, 520);
        timer.fn();
        assert.equal(e.classes.has('studio-navigation-arriving'), false);
        assert.equal(e.properties.size, 0);
        assert.equal(e.storage.has(e.key), false);
    }
});

test('fallback uses clientWidth, and duplicate navigation is prevented with reduced motion', () => {
    const e=environment({ viewport:false, reduced:true });
    e.progress.startStudio();
    assert.equal(e.properties.get('--studio-viewport-width'), '690px');
    e.window.TrafficCatcherNavigate('/studio');
    e.window.TrafficCatcherNavigate('/other');
    assert.equal(e.window.location.href, 'https://example.test/studio');
});
