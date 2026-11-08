// Loads the extension into Chromium with a stubbed SillyTavern context.
// CHROMIUM=/path/to/chrome RUMORPH_DIR=../SillyTavern-RuMorph node test/browser/run.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { start } from './server.mjs';

const exe = process.env.CHROMIUM || undefined;
const server = await start();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: exe });
const results = [];

async function open(query) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
    const dawg = [];
    page.on('request', (r) => r.url().endsWith('words.dawg') && dawg.push(r.url()));
    await page.goto(base + query);
    await page.waitForFunction(() => window.__harness?.started && window.__logs.some(([, m]) => m.includes('[RuInflect] v0.1.0 loaded')));
    await page.waitForFunction(() => document.getElementById('ruinflect_status')?.textContent.includes('словари загружены')
        || document.getElementById('ruinflect_status')?.textContent.includes('dictionaries loaded'), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    return { page, dawg };
}
const errorsOf = (logs) => logs.filter(([l, m]) => l === 'error');

async function check(name, fn) {
    try {
        await fn();
        results.push(['ok', name]);
    } catch (e) {
        results.push(['FAIL', name, e.message]);
    }
}

// 1. RuInflect alone
{
    const { page, dawg } = await open('?ext=SillyTavern-RuInflect');
    const fm = 'Элдрин подходит к {{uc::дт}}. — Ты {{ug::пришёл}}!';
    await check('alone: dictionaries fetched once', async () => assert.equal(dawg.length, 1));
    await check('alone: macros registered', async () => {
        const names = await page.evaluate(() => [...window.__harness.macros.keys()].sort());
        assert.deepEqual(names, ['cc', 'cg', 'charcase', 'charg', 'chargender', 'inflect', 'uc', 'ug', 'usercase', 'userg', 'usergender']);
    });
    await check('alone: persona without gender → masculine form', async () => {
        assert.equal(await page.evaluate((t) => window.__harness.evaluate(t), fm), 'Элдрин подходит к Анне. — Ты пришёл!');
    });
    await check('alone: set persona gender f in the panel', async () => {
        await page.selectOption('#ruinflect_persona_slot select[data-role="gender"]', 'f');
        assert.equal(await page.evaluate((t) => window.__harness.evaluate(t), fm), 'Элдрин подходит к Анне. — Ты пришла!');
        const rec = await page.evaluate(() => SillyTavern.getContext().extensionSettings.ruinflect.personas['anna.png']);
        assert.deepEqual(rec, { gender: 'f' });
        assert.equal(await page.inputValue('#ruinflect_native_gender'), 'f');
    });
    await check('alone: persona Иван (m)', async () => {
        await page.evaluate(async () => {
            const m = await import('/scripts/personas.js');
            m.__setAvatar('ivan.png');
            window.__harness.name1 = 'Иван';
            await window.__harness.fire('persona_changed', 'ivan.png');
        });
        await page.selectOption('#ruinflect_persona_slot select[data-role="gender"]', 'm');
        assert.equal(await page.evaluate((t) => window.__harness.evaluate(t), fm), 'Элдрин подходит к Ивану. — Ты пришёл!');
    });
    await check('alone: hint injected', async () => {
        const p = await page.evaluate(() => window.__harness.prompts.ruinflect_gender);
        assert.match(p.value, /\{\{user\}\} — мужчина/);
        assert.match(p.value, /\{\{char\}\} — мужчина/);
        assert.equal(p.position, 1);
    });
    await check('alone: manual form in the persona table', async () => {
        await page.fill('#ruinflect_persona_slot input[data-case="datv"]', 'Ванечке');
        await page.press('#ruinflect_persona_slot input[data-case="datv"]', 'Tab');
        assert.equal(await page.evaluate(() => window.__harness.evaluate('к {{uc::дт}}')), 'к Ванечке');
        await page.fill('#ruinflect_persona_slot input[data-case="datv"]', '');
        await page.press('#ruinflect_persona_slot input[data-case="datv"]', 'Tab');
    });
    await check('alone: preview with player gender switch', async () => {
        await page.fill('#ruinflect_preview_text', '{{char}} подходит к {{uc::дт}}. — Ты {{ug::пришёл}}!');
        await page.waitForTimeout(400);
        assert.equal(await page.textContent('#ruinflect_preview_out'), 'Элдрин подходит к Ивану. — Ты пришёл!');
        await page.selectOption('#ruinflect_preview_gender', 'f');
        assert.equal(await page.textContent('#ruinflect_preview_out'), 'Элдрин подходит к Ивану. — Ты пришла!');
    });
    await check('alone: group chat, each member has its own forms', async () => {
        const out = await page.evaluate(async () => {
            window.__harness.groupId = 'g1';
            await window.__harness.fire('chat_changed');
            return [window.__harness.evaluate('к {{cc::дт}} {{cg::пришёл}}', undefined, 'Элдрин'), window.__harness.evaluate('к {{cc::дт}} {{cg::пришёл}}', undefined, 'Морвенна')];
        });
        assert.deepEqual(out, ['к Элдрину пришёл', 'к Морвенне пришла']);
        assert.ok(await page.isVisible('#ruinflect_member_row'));
    });
    await check('alone: character gender saved to the card', async () => {
        await page.selectOption('#ruinflect_member', '1');
        await page.selectOption('#ruinflect_char_slot select[data-role="gender"]', 'pl');
        await page.waitForTimeout(900);
        const w = await page.evaluate(() => window.__harness.written.at(-1));
        // Full shape with nulls: ST merges data.extensions deeply on the server.
        assert.deepEqual([w[0], w[1], w[2].gender, w[2].forms.datv], [1, 'ruinflect', 'pl', null]);
        assert.equal(await page.evaluate(() => window.__harness.evaluate('{{cg::пришёл}}', undefined, 'Морвенна')), 'пришли');
    });
    await check('alone: slash commands', async () => {
        const r = await page.evaluate(async () => [
            await window.__harness.commands.inflect.callback({}, 'Тёмный лес пр2'),
            await window.__harness.commands['ruinflect-gender'].callback({}, 'user'),
        ]);
        assert.deepEqual(r, ['Тёмном лесу', 'm']);
    });
    await check('alone: disabling unregisters the macros', async () => {
        await page.uncheck('#ruinflect_enabled');
        assert.equal(await page.evaluate(() => window.__harness.evaluate('к {{uc::дт}}')), 'к {{uc::дт}}');
        assert.equal(await page.evaluate(() => window.__harness.prompts.ruinflect_gender.value), '');
        await page.check('#ruinflect_enabled');
        assert.equal(await page.evaluate(() => window.__harness.evaluate('к {{uc::дт}}')), 'к Ивану');
    });
    await check('alone: no console errors', async () => assert.deepEqual(errorsOf(await page.evaluate(() => window.__logs)), []));
    await page.evaluate(() => { window.__harness.groupId = null; });
    await page.screenshot({ path: fileURLToPath(new URL('ruinflect-panel.png', import.meta.url)), fullPage: true });
    await page.close();
}

// 2. Legacy engine
{
    const { page } = await open('?ext=SillyTavern-RuInflect&legacy=1');
    await check('legacy: flat macros', async () => {
        await page.selectOption('#ruinflect_persona_slot select[data-role="gender"]', 'f');
        assert.equal(await page.evaluate(() => window.__harness.evaluate('к {{user_datv}}, {{user_gender}}')), 'к Анне, f');
        assert.ok(await page.isVisible('#ruinflect_engine_warning'));
    });
    await page.close();
}

// 3. With RuMorph
{
    const label = 'with RuMorph';
    const s2 = await start();
    const url = `http://127.0.0.1:${s2.address().port}/`;
    const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
    const dawg = [];
    page.on('request', (r) => r.url().endsWith('words.dawg') && dawg.push(r.url()));
    await page.goto(url + '?ext=SillyTavern-RuMorph,SillyTavern-RuInflect');
    await page.waitForFunction(() => document.getElementById('ruinflect_status')?.textContent.includes('dictionaries loaded'), null, { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('rumorph_status')?.textContent.includes('dictionaries loaded'), null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await check(`${label}: dictionaries fetched once`, async () => assert.equal(dawg.length, 1));
    await check(`${label}: macros work`, async () => assert.equal(await page.evaluate(() => window.__harness.evaluate('к {{uc::дт}}')), 'к Анне'));
    await check(`${label}: no console errors`, async () => assert.deepEqual(errorsOf(await page.evaluate(() => window.__logs)), []));
    await page.screenshot({ path: fileURLToPath(new URL('both-panels.png', import.meta.url)), fullPage: true });
    await page.close();
    s2.close();
}

for (const r of results) console.log(r.join(' | '));
await browser.close();
server.close();
process.exitCode = results.some((r) => r[0] !== 'ok') ? 1 : 0;
