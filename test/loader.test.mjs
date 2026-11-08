import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CORE_KEY, acquireAz, peekAz } from '../src/core/loader.js';
import { initAz } from '../src/core/morph.js';
import { root } from './helpers.mjs';

const require = createRequire(path.join(root, 'package.json'));

test('two extensions in the same tick share one load', async () => {
    const g = {};
    let loads = 0;
    const load = async () => {
        loads++;
        await new Promise((r) => setTimeout(r, 10));
        return { Morph: () => [] };
    };
    const a = acquireAz({ owner: 'RuMorph', load, global: g });
    const b = acquireAz({ owner: 'RuInflect', load, global: g });
    assert.equal(a, b);
    assert.equal(peekAz(g), null);
    const [azA, azB] = await Promise.all([a.promise, b.promise]);
    assert.equal(azA, azB);
    assert.equal(loads, 1);
    assert.deepEqual(g[CORE_KEY].users, ['RuMorph', 'RuInflect']);
    assert.equal(peekAz(g), azA);
    assert.equal(g[CORE_KEY].owner, 'RuMorph');
});

test('a late extension reuses the ready instance', async () => {
    const g = {};
    let loads = 0;
    const load = async () => ({ n: ++loads });
    await acquireAz({ owner: 'RuMorph', load, global: g }).promise;
    const late = acquireAz({ owner: 'RuInflect', load, global: g });
    assert.equal(late.state, 'ready');
    assert.deepEqual(await late.promise, { n: 1 });
    assert.equal(loads, 1);
});

test('a failed load can be retried', async () => {
    const g = {};
    let calls = 0;
    const load = async () => {
        if (++calls === 1) throw new Error('network');
        return { ok: true };
    };
    await assert.rejects(acquireAz({ owner: 'RuInflect', load, global: g }).promise, /network/);
    assert.equal(g[CORE_KEY], undefined);
    assert.deepEqual(await acquireAz({ owner: 'RuMorph', load, global: g }).promise, { ok: true });
    assert.equal(calls, 2);
});

test('an entry with another protocol is replaced', async () => {
    const g = { [CORE_KEY]: { protocol: 999, state: 'ready', promise: Promise.resolve('old') } };
    const core = acquireAz({ owner: 'RuInflect', load: async () => 'new', global: g });
    assert.equal(await core.promise, 'new');
});

test('real dictionaries are initialised once for RuMorph and RuInflect', async () => {
    const g = {};
    const Az = require(path.join(root, 'vendor/az/az.min.js'));
    let inits = 0;
    const load = async () => {
        inits++;
        await initAz(Az, path.join(root, 'dicts'));
        return Az;
    };
    // RuInflect starts a bit later than RuMorph.
    const rumorph = acquireAz({ owner: 'RuMorph', load, global: g });
    await new Promise((r) => setImmediate(r));
    const ruinflect = acquireAz({ owner: 'RuInflect', load, global: g });
    const [a, b] = await Promise.all([rumorph.promise, ruinflect.promise]);
    assert.equal(a, b);
    assert.equal(inits, 1);
    assert.ok(b.Morph('Анна').length > 0);
});
