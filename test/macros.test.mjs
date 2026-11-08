import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyMacros, createMacroDefinitions } from '../src/macros.js';
import { FormsTable } from '../src/precompute.js';
import { currentAvatar, getCardRecord, setPersonaRecord, specFor } from '../src/storage.js';
import { buildHint } from '../src/inject.js';
import { getMorph } from './helpers.mjs';

const morph = await getMorph();

// The same checks MacroRegistry.buildMacroDefFromOptions makes (ST ad29cbd).
const MACRO_IDENTIFIER_PATTERN = /^[a-zA-Z][\w-_]*$/;

/** A tiny stand-in for the ST macro engine: {{name::a::b}} without nesting. */
function makeEngine({ people, morphReady = true, userName = 'Анна', charName = 'Элдрин' }) {
    const state = { morph: morphReady ? morph : null, misses: [] };
    const getSpec = (role, name) => {
        const p = people[role]?.[name];
        return specFor(p, name);
    };
    const table = new FormsTable({ getMorph: () => state.morph, getSpec, onMiss: (r, n) => state.misses.push(`${r}:${n}`) });
    const defs = createMacroDefinitions({
        entry: (role, name) => table.lookup(role, name),
        gender: (role, name) => getSpec(role, name).gender,
        morph: () => state.morph,
    });
    const byName = new Map();
    for (const d of defs) {
        byName.set(d.name.toLowerCase(), d);
        for (const a of d.options.aliases ?? []) byName.set(a.alias.toLowerCase(), d);
    }
    const run = (text, env = { names: { user: userName, char: charName } }) => {
        const warnings = [];
        const out = text.replace(/\{\{([a-zA-Z][\w-]*)((?:::[^}]*?)*)\}\}/g, (all, name, rest) => {
            if (name === 'user') return env.names.user;
            if (name === 'char') return env.names.char;
            const d = byName.get(name.toLowerCase());
            if (!d) return all;
            const args = rest ? rest.split('::').slice(1) : [];
            return d.options.handler({ name, args, unnamedArgs: args, env, warn: (m) => warnings.push(m) });
        });
        return { out, warnings };
    };
    return { run, table, state, defs };
}

const people = {
    user: { Анна: { gender: 'f' }, Иван: { gender: 'm' }, Они: { gender: 'pl' }, Оно: { gender: 'n' } },
    char: { Элдрин: { gender: 'm' }, Морвенна: { gender: 'f' }, Кира: { gender: 'f', forms: { datv: 'Кирочке' }, name: 'Кира' } },
};

test('definitions are valid for MacroRegistry', () => {
    const { defs } = makeEngine({ people });
    for (const d of defs) {
        assert.match(d.name, MACRO_IDENTIFIER_PATTERN);
        for (const a of d.options.aliases ?? []) assert.match(a.alias, MACRO_IDENTIFIER_PATTERN);
        const args = d.options.unnamedArgs ?? [];
        let optional = false;
        for (const a of args) {
            if (optional) assert.ok(a.optional, `${d.name}: required arg after optional`);
            optional ||= !!a.optional;
        }
        assert.equal(typeof d.options.handler, 'function');
        assert.ok(d.options.description);
        assert.ok(d.options.category);
        for (const ex of [].concat(d.options.exampleUsage ?? [])) assert.match(ex, /\{\{/);
    }
});

test('first_mes for a female and a male persona', () => {
    const fm = '{{char}} подходит к {{uc::дт}}. — Ты {{ug::пришёл}}!';
    assert.equal(makeEngine({ people, userName: 'Анна' }).run(fm).out, 'Элдрин подходит к Анне. — Ты пришла!');
    assert.equal(makeEngine({ people, userName: 'Иван' }).run(fm).out, 'Элдрин подходит к Ивану. — Ты пришёл!');
});

test('all case codes and the character', () => {
    const { run } = makeEngine({ people });
    assert.equal(run('{{uc::рд}} {{uc::вн}} {{userCase::тв}} {{uc::Пр.п.}} {{uc}}').out, 'Анны Анну Анной Анне Анна');
    assert.equal(run('к {{cc::дт}}, вижу {{charCase::acc}}, с {{cc::ins}}').out, 'к Элдрину, вижу Элдрина, с Элдрином');
});

test('unknown case: nominative and a warning', () => {
    const r = makeEngine({ people }).run('к {{uc::xyz}}');
    assert.equal(r.out, 'к Анна');
    assert.equal(r.warnings.length, 1);
});

test('cache miss before the dictionaries load: nominative, warning, background request', () => {
    const e = makeEngine({ people, morphReady: false });
    const r = e.run('к {{uc::дт}}');
    assert.equal(r.out, 'к Анна');
    assert.equal(r.warnings.length, 1);
    assert.deepEqual(e.state.misses, ['user:Анна']);
    e.state.morph = morph;
    e.table.rebuild([{ role: 'user', name: 'Анна' }]);
    assert.equal(e.run('к {{uc::дт}}').out, 'к Анне');
});

test('group chat: each character has its own forms', () => {
    const { run } = makeEngine({ people });
    const env = (char) => ({ names: { user: 'Анна', char } });
    assert.equal(run('к {{cc::дт}} {{cg::пришёл}}', env('Элдрин')).out, 'к Элдрину пришёл');
    assert.equal(run('к {{cc::дт}} {{cg::пришёл}}', env('Морвенна')).out, 'к Морвенне пришла');
});

test('name1Override: the name from env is declined', () => {
    const { run } = makeEngine({ people });
    assert.equal(run('к {{uc::дт}}', { names: { user: 'Иван', char: 'Элдрин' } }).out, 'к Ивану');
});

test('manual forms win over the dictionary', () => {
    const { run } = makeEngine({ people });
    assert.equal(run('к {{cc::дт}}', { names: { user: 'Анна', char: 'Кира' } }).out, 'к Кирочке');
    assert.equal(run('у {{cc::рд}}', { names: { user: 'Анна', char: 'Кира' } }).out, 'у Киры');
});

test('capitalisation of the name is kept', () => {
    const { run } = makeEngine({ people: { user: { АННА: { gender: 'f' } }, char: {} } });
    assert.equal(run('к {{uc::дт}}', { names: { user: 'АННА', char: '' } }).out, 'к АННЕ');
});

test('gender macros', () => {
    const p = (user) => makeEngine({ people, userName: user });
    assert.equal(p('Анна').run('{{ug::пришёл}} {{ug::готов}} {{ug::уставший}}').out, 'пришла готова уставшая');
    assert.equal(p('Оно').run('{{ug::пришёл}}').out, 'пришло');
    assert.equal(p('Они').run('{{ug::пришёл}}').out, 'пришли');
    assert.equal(p('Анна').run('{{ug::пришёл::пришла}}').out, 'пришла');
    assert.equal(p('Иван').run('{{userG::пришёл::пришла}}').out, 'пришёл');
    const pl = p('Они').run('{{ug::пришёл::пришла}}');
    assert.equal(pl.out, 'пришёл');
    assert.equal(pl.warnings.length, 1);
    assert.equal(p('Они').run('{{ug::пришёл::пришла::пришли}}').out, 'пришли');
    const unknown = p('Анна').run('{{ug::флымбрил}}');
    assert.equal(unknown.out, 'флымбрил');
    assert.equal(unknown.warnings.length, 1);
    assert.equal(p('Анна').run('{{userGender}} {{charGender}}').out, 'f m');
    assert.equal(p('Никто').run('[{{userGender}}] {{ug::пришёл}} {{ug::пришёл::пришла}}').out, '[] пришёл пришёл');
});

test('inflect macro', () => {
    const { run } = makeEngine({ people });
    assert.equal(run('в {{inflect::Тёмный лес::пр2}}').out, 'в Тёмном лесу');
    assert.equal(run('с {{inflect::дракон::тв::мн}}').out, 'с драконами');
    const bad = run('{{inflect::лес::zz}}');
    assert.equal(bad.out, 'лес');
    assert.equal(bad.warnings.length, 1);
});

test('legacy flat macros', () => {
    const table = new FormsTable({ getMorph: () => morph, getSpec: (r, n) => specFor(people[r]?.[n], n) });
    const macros = createLegacyMacros({
        entry: (r, n) => table.lookup(r, n),
        gender: (r, n) => specFor(people[r]?.[n], n).gender,
        morph: () => morph,
        fallbackName: (r) => (r === 'user' ? 'Анна' : 'Элдрин'),
    });
    const get = (k) => macros.find((m) => m.key === k).value();
    assert.equal(get('user_datv'), 'Анне');
    assert.equal(get('char_gent'), 'Элдрина');
    assert.equal(get('user_gender'), 'f');
});

test('storage', () => {
    const settings = {};
    setPersonaRecord(settings, 'a.png', { gender: 'ж', forms: { datv: ' Анечке ', gent: '' }, name: 'Анна' });
    assert.deepEqual(settings.personas['a.png'], { gender: 'f', forms: { datv: 'Анечке' }, name: 'Анна' });
    assert.deepEqual(specFor(settings.personas['a.png'], 'Анна'), { gender: 'f', forms: { datv: 'Анечке' } });
    // After a rename the manual forms no longer apply, the gender does.
    assert.deepEqual(specFor(settings.personas['a.png'], 'Аня'), { gender: 'f', forms: {} });
    setPersonaRecord(settings, 'a.png', { gender: '' });
    assert.equal(settings.personas['a.png'], undefined);
    assert.equal(getCardRecord({ data: { extensions: { ruinflect: { gender: 'm' } } } }).gender, 'm');
    assert.equal(getCardRecord({}), null);
});

test('current persona', () => {
    const powerUser = { personas: { 'a.png': 'Анна', 'b.png': 'Иван', 'c.png': 'Анна' }, default_persona: 'c.png' };
    assert.equal(currentAvatar({ userAvatar: 'b.png', powerUser, name1: 'Иван' }), 'b.png');
    assert.equal(currentAvatar({ powerUser, name1: 'Анна' }), 'c.png');
    assert.equal(currentAvatar({ powerUser, name1: 'Анна', chatMetadata: { persona: 'a.png' } }), 'a.png');
    assert.equal(currentAvatar({ powerUser, name1: 'Иван' }), 'b.png');
    assert.equal(currentAvatar({ powerUser, name1: 'Пётр' }), null);
});

test('hint for the model', () => {
    assert.equal(
        buildHint({ userGender: 'f', charGender: 'm' }),
        '[{{user}} — женщина. Обращайся к {{user}} в женском роде: «ты пришла», «ты устала». {{char}} — мужчина, о себе говорит в мужском роде: «я пришёл», «я устал».]',
    );
    assert.equal(buildHint({ userGender: null, charGender: null }), '');
    assert.equal(buildHint({ userGender: 'pl', charGender: null }), '[{{user}} — несколько персонажей. Обращайся к {{user}} во множественном числе: «вы пришли», «вы устали».]');
    assert.equal(buildHint({ userGender: 'm', charGender: 'f', userTemplate: '{{user}}: {rod}', charTemplate: '', wrapper: '<{text}>' }), '<{{user}}: в мужском роде>');
});

test('card payload clears removed forms', async () => {
    const { toCardPayload } = await import('../src/storage.js');
    const p = toCardPayload({ gender: 'ж', name: 'Кира', forms: { datv: 'Кирочке' }, backup: { x: 1 } });
    assert.equal(p.gender, 'f');
    assert.equal(p.name, 'Кира');
    assert.equal(p.forms.datv, 'Кирочке');
    assert.equal(p.forms.gent, null);
    assert.ok(!('backup' in p));
    assert.deepEqual(toCardPayload({}).forms.datv, null);
    assert.equal(specFor(p, 'Кира').forms.datv, 'Кирочке');
    assert.equal(specFor(p, 'Кира').gender, 'f');
});
