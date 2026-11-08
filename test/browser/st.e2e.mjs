// ST_URL=http://127.0.0.1:8000 node test/browser/st.e2e.mjs
// Creates a temporary character, sets the persona gender and checks the greeting.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const url = process.env.ST_URL ?? 'http://127.0.0.1:8000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && m.text().includes('RuInflect') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

try {
    await page.goto(url);
    await page.waitForFunction(() => !!document.getElementById('ruinflect_container'), null, { timeout: 60000 });
    await page.waitForFunction(() => /loaded|загружены/.test(document.getElementById('ruinflect_status')?.textContent ?? ''), null, { timeout: 60000 });

    const name = `RuInflect e2e ${Date.now()}`;
    const avatar = await page.evaluate(async (name) => {
        const c = SillyTavern.getContext();
        const form = new FormData();
        form.append('ch_name', name);
        form.append('first_mes', '{{char}} подходит к {{uc::дт}}. — Ты {{ug::пришёл}}!');
        for (const k of ['description', 'personality', 'scenario', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'tags', 'creator', 'character_version']) form.append(k, '');
        form.append('talkativeness', '0.5');
        form.append('fav', 'false');
        const headers = c.getRequestHeaders();
        delete headers['Content-Type'];
        const res = await fetch('/api/characters/create', { method: 'POST', headers, body: form });
        const file = await res.text();
        await c.getCharacters();
        return file;
    }, name);

    await page.selectOption('#ruinflect_native_gender', 'f');

    const greeting = await page.evaluate(async (avatar) => {
        const c = SillyTavern.getContext();
        const id = c.characters.findIndex((ch) => ch.avatar === avatar);
        await c.selectCharacterById(id);
        await new Promise((r) => setTimeout(r, 1500));
        return { mes: SillyTavern.getContext().chat[0]?.mes, user: SillyTavern.getContext().name1 };
    }, avatar);
    const dative = await page.evaluate((n) => SillyTavern.getContext().substituteParams('{{uc::дт}}', n), greeting.user);
    assert.equal(greeting.mes, `${name} подходит к ${dative}. — Ты пришла!`);

    const sample = await page.evaluate(() => SillyTavern.getContext().substituteParams('к {{uc::дт}}, {{inflect::Тёмный лес::пр2}}', 'Анна'));
    assert.equal(sample, 'к Анне, Тёмном лесу');

    const listed = await page.evaluate(() => ['uc', 'cc', 'ug', 'cg', 'inflect', 'userGender', 'charGender'].every((n) => SillyTavern.getContext().macros.registry.hasMacro(n)));
    assert.ok(listed);

    await page.evaluate(async (avatar) => {
        const c = SillyTavern.getContext();
        await fetch('/api/characters/delete', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar, delete_chats: true }) });
    }, avatar);
    assert.deepEqual(errors, []);
    console.log('ok: first_mes, macro engine, macro browser');
} finally {
    await browser.close();
}
