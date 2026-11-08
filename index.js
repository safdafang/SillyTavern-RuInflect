import { MAIN_CASES, normalizeCase, normalizeNumber } from './src/cases.js';
import { acquireAz, peekAz } from './src/core/loader.js';
import { Morph, initAz, loadAzBrowser } from './src/core/morph.js';
import { toGender } from './src/gender.js';
import { inflectPhrase } from './src/inflect.js';
import {
    DEFAULT_CHAT_TEMPLATE, DEFAULT_USER_TEMPLATE, DEFAULT_WRAPPER, PROMPT_KEY, buildHint,
} from './src/inject.js';
import { MACRO_NAMES, createLegacyMacros, createMacroDefinitions } from './src/macros.js';
import { normalizeGender } from './src/names.js';
import { FormsTable } from './src/precompute.js';
import {
    CARD_KEY, MODULE, currentAvatar, getCardRecord, getPersonaRecord, setPersonaRecord, specFor, toCardPayload,
} from './src/storage.js';

const LOG = '[RuInflect]';
const VERSION = '0.1.0';
const BASE_URL = new URL('.', import.meta.url);
// Works for both per-user (data/<user>/extensions) and global (third-party) installs.
const EXT_PATH = decodeURIComponent(new URL(import.meta.url).pathname)
    .match(/\/scripts\/extensions\/(.+)\/index\.js$/)?.[1] ?? 'third-party/SillyTavern-RuInflect';

const DEFAULTS = Object.freeze({
    enabled: true,
    hint: {
        enabled: true,
        position: 1,
        depth: 1,
        role: 0,
        userTemplate: DEFAULT_USER_TEMPLATE,
        charTemplate: DEFAULT_CHAT_TEMPLATE,
        wrapper: DEFAULT_WRAPPER,
    },
    debug: false,
    personas: {},
});

const ctx = () => SillyTavern.getContext();
const $id = (id) => document.getElementById(id);
const t = (strings, ...values) => {
    const tag = ctx().t;
    if (typeof tag === 'function') return tag(strings, ...values);
    return strings.reduce((acc, s, i) => acc + s + (i < values.length ? values[i] : ''), '');
};

const log = (...args) => console.log(LOG, ...args);
const debug = (...args) => {
    if (getSettings().debug) console.debug(LOG, ...args);
};

function getSettings() {
    const { extensionSettings } = ctx();
    if (!extensionSettings[MODULE] || typeof extensionSettings[MODULE] !== 'object') {
        extensionSettings[MODULE] = structuredClone(DEFAULTS);
    }
    const s = extensionSettings[MODULE];
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (!(k in s)) s[k] = structuredClone(v);
        else if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'personas') {
            if (!s[k] || typeof s[k] !== 'object') s[k] = structuredClone(v);
            for (const [kk, vv] of Object.entries(v)) if (!(kk in s[k])) s[k][kk] = vv;
        }
    }
    if (!s.personas || typeof s.personas !== 'object') s.personas = {};
    return s;
}

function save() {
    ctx().saveSettingsDebounced();
}

let morph = null;
let core = null;

function morphNow() {
    if (morph) return morph;
    const Az = peekAz();
    if (Az) morph = new Morph(Az);
    return morph;
}

function ensureMorph() {
    if (morphNow()) return Promise.resolve(morph);
    const started = performance.now();
    core = acquireAz({
        owner: 'RuInflect',
        load: async () => {
            const Az = await loadAzBrowser(new URL('vendor/az/az.min.js', BASE_URL).href);
            await initAz(Az, new URL('dicts', BASE_URL).href);
            log(`dictionaries loaded in ${Math.round(performance.now() - started)} ms`);
            return Az;
        },
    });
    updateStatus();
    return core.promise.then((Az) => {
        morph = morph ?? new Morph(Az);
        if (core.owner !== 'RuInflect') log(`dictionaries shared with ${core.owner}`);
        updateStatus();
        return morph;
    }, (e) => {
        console.error(LOG, 'failed to load Az.js', e);
        updateStatus();
        throw e;
    });
}

// user_avatar is not in getContext().
let personasModule = null;
async function loadPersonasModule() {
    try {
        personasModule = await import(new URL('../../../personas.js', import.meta.url).href);
    } catch (e) {
        debug('personas.js is not available, the persona is found by name', e);
    }
}

function avatarId() {
    const c = ctx();
    return currentAvatar({
        userAvatar: personasModule?.user_avatar,
        powerUser: c.powerUserSettings,
        chatMetadata: c.chatMetadata,
        name1: c.name1,
    });
}

function groupMembers() {
    const c = ctx();
    if (!c.groupId) return [];
    const group = c.groups?.find((g) => g.id == c.groupId);
    return (group?.members ?? []).map((avatar) => c.characters.findIndex((ch) => ch.avatar === avatar)).filter((i) => i >= 0);
}

function chatCharacters() {
    const c = ctx();
    if (c.groupId) return groupMembers();
    const id = Number(c.characterId);
    return Number.isInteger(id) && id >= 0 && c.characters[id] ? [id] : [];
}

function characterIdByName(name) {
    const c = ctx();
    for (const id of chatCharacters()) if (c.characters[id]?.name === name) return id;
    const id = c.characters.findIndex((ch) => ch?.name === name);
    return id >= 0 ? id : null;
}

let previewGender = null;

function getSpec(role, name) {
    if (role === 'user') return specFor(getPersonaRecord(getSettings(), avatarId()), name);
    const id = characterIdByName(name);
    return specFor(id === null ? null : getCardRecord(ctx().characters[id]), name);
}

let missPending = false;
const table = new FormsTable({
    getMorph: morphNow,
    getSpec,
    onMiss: (role, name) => {
        debug('forms are not ready for', role, name);
        if (missPending) return;
        missPending = true;
        ensureMorph().then(() => {
            missPending = false;
            rebuild();
            refreshGreeting();
        }).catch(() => {
            missPending = false;
        });
    },
});

function participants() {
    const c = ctx();
    const out = [{ role: 'user', name: c.name1 }];
    for (const id of chatCharacters()) out.push({ role: 'char', name: c.characters[id].name });
    return out;
}

function rebuild() {
    const n = table.rebuild(participants());
    debug(`forms computed for ${n} names`);
    updateHint();
    renderPeople();
    updateStatus();
}

// ST stores the greeting already substituted; rebuild it like on a persona change.
const MACRO_IN_TEXT = /\{\{\s*(?:uc|cc|usercase|charcase|ug|cg|userg|charg|inflect|usergender|chargender)\b/i;

async function refreshGreeting() {
    try {
        const c = ctx();
        if (c.chat?.length !== 1 || c.chat[0]?.is_user || c.chatMetadata?.tainted) return;
        const greetings = chatCharacters().flatMap((id) => {
            const ch = c.characters[id];
            return [ch?.first_mes, ...(ch?.data?.alternate_greetings ?? [])];
        });
        if (!greetings.some((g) => typeof g === 'string' && MACRO_IN_TEXT.test(g))) return;
        if (typeof personasModule?.retriggerFirstMessageOnEmptyChat === 'function') {
            await personasModule.retriggerFirstMessageOnEmptyChat();
            debug('greeting rebuilt');
        }
    } catch (e) {
        debug('could not rebuild the greeting', e);
    }
}

const macroDeps = {
    entry: (role, name) => table.lookup(role, name),
    gender: (role, name) => (role === 'user' && previewGender) || getSpec(role, name).gender,
    morph: morphNow,
    fallbackName: (role) => (role === 'user' ? ctx().name1 : ctx().name2) ?? '',
    t,
};

let registered = null;

function engineOn() {
    const c = ctx();
    return typeof c.macros?.register === 'function' && c.powerUserSettings?.experimental_macro_engine !== false;
}

function registerMacros() {
    if (registered) return;
    const c = ctx();
    if (engineOn()) {
        for (const { name, options } of createMacroDefinitions(macroDeps)) c.macros.register(name, options);
        registered = 'engine';
    } else if (typeof c.registerMacro === 'function') {
        for (const { key, value, description } of createLegacyMacros(macroDeps)) c.registerMacro(key, value, description);
        registered = 'legacy';
        console.warn(LOG, 'the new macro engine is off, only flat macros like {{user_datv}} are available');
    }
    const warn = $id('ruinflect_engine_warning');
    if (warn) warn.classList.toggle('displayNone', registered === 'engine');
}

function unregisterMacros() {
    const c = ctx();
    if (registered === 'engine') {
        for (const name of MACRO_NAMES) c.macros.registry.unregisterMacro(name);
    } else if (registered === 'legacy') {
        for (const { key } of createLegacyMacros(macroDeps)) c.unregisterMacro(key);
    }
    registered = null;
}

let speakingId = null;

function updateHint() {
    const c = ctx();
    const s = getSettings();
    if (!s.enabled || !s.hint.enabled) {
        c.setExtensionPrompt(PROMPT_KEY, '', 1, 0);
        renderHintPreview('');
        return;
    }
    const chars = chatCharacters();
    const id = chars.includes(speakingId) ? speakingId : chars[0];
    const charName = id === undefined ? '' : c.characters[id]?.name;
    const text = buildHint({
        userGender: getSpec('user', c.name1).gender,
        charGender: charName ? getSpec('char', charName).gender : null,
        userTemplate: s.hint.userTemplate,
        charTemplate: s.hint.charTemplate,
        wrapper: s.hint.wrapper,
    });
    c.setExtensionPrompt(PROMPT_KEY, text, Number(s.hint.position), Number(s.hint.depth) || 0, false, Number(s.hint.role) || 0);
    renderHintPreview(text);
}

function renderHintPreview(text) {
    const el = $id('ruinflect_hint_current');
    if (el) el.textContent = text || t`(nothing: no gender is set)`;
}

function onSpecChanged() {
    table.clear();
    rebuild();
    renderPreview();
    refreshGreeting();
}

const cardSaves = new Map();
function saveCardRecord(id, rec) {
    const c = ctx();
    const ch = c.characters[id];
    if (!ch) return;
    const backup = getCardRecord(ch)?.backup;
    const payload = toCardPayload(rec);
    ch.data ??= {};
    ch.data.extensions ??= {};
    ch.data.extensions[CARD_KEY] = backup ? { ...payload, backup } : payload;
    clearTimeout(cardSaves.get(id));
    cardSaves.set(id, setTimeout(() => {
        cardSaves.delete(id);
        c.writeExtensionField(id, CARD_KEY, payload).then(() => {
            if (backup && ch.data?.extensions?.[CARD_KEY]) ch.data.extensions[CARD_KEY].backup ??= backup;
        }).catch((e) => console.error(LOG, 'could not save the card', e));
    }, 700));
    onSpecChanged();
}

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

const CASE_LABELS = () => ({
    nomn: t`Nominative`, gent: t`Genitive`, datv: t`Dative`, accs: t`Accusative`, ablt: t`Instrumental`, loct: t`Prepositional`,
});
const CASE_QUESTIONS = { nomn: 'кто?', gent: 'кого?', datv: 'кому?', accs: 'кого?', ablt: 'кем?', loct: 'о ком?' };

function sourceLabel(source) {
    return {
        dictionary: t`dictionary`,
        guess: t`guessed`,
        manual: t`manual`,
        latin: t`not Cyrillic`,
        pending: t`dictionaries are loading`,
    }[source] ?? source;
}

let personTemplate = '';

function renderPerson(slot, { name, record, role, onChange }) {
    if (!slot) return;
    if (!name) {
        slot.replaceChildren(element('small', 'ruinflect-hint', role === 'user' ? t`No persona selected.` : t`No character selected.`));
        return;
    }
    slot.innerHTML = personTemplate;
    const root = slot.firstElementChild;
    const q = (r) => root.querySelector(`[data-role="${r}"]`);
    q('name').textContent = name;
    const rec = record ?? {};
    const spec = specFor(rec, name);
    q('gender').value = spec.gender ?? '';
    const entry = table.lookup(role, name);

    const notes = [];
    if (!spec.gender) notes.push(entry?.gender ? t`Gender not set; guessed: ${genderLabel(entry.gender)}.` : t`Gender not set.`);
    if (entry?.uncertain && !spec.gender) notes.push(t`The guess is uncertain, please set the gender.`);
    if (!entry) notes.push(t`Dictionaries are loading…`);
    q('note').textContent = notes.join(' ');

    const forms = q('forms');
    const labels = CASE_LABELS();
    for (const c of MAIN_CASES) {
        const row = element('div', 'ruinflect-form-row');
        const label = element('span', 'ruinflect-case', labels[c]);
        label.title = CASE_QUESTIONS[c];
        const input = element('input', 'text_pole');
        input.type = 'text';
        input.dataset.case = c;
        const manual = spec.forms?.[c] ?? '';
        input.value = manual;
        input.placeholder = entry?.auto?.[c] ?? name;
        if (c === 'nomn') {
            input.disabled = true;
            input.value = name;
        }
        const src = entry ? (manual ? 'manual' : entry.sources?.[c] ?? entry.source) : 'pending';
        const dot = element('span', `ruinflect-word ruinflect-src-${src}`, sourceLabel(src));
        row.append(label, input, dot);
        forms.append(row);
    }

    const collect = () => {
        const next = { ...rec, gender: q('gender').value || null, name, forms: {} };
        for (const input of forms.querySelectorAll('input[data-case]')) {
            if (input.dataset.case !== 'nomn' && input.value.trim()) next.forms[input.dataset.case] = input.value.trim();
        }
        onChange(next);
    };
    q('gender').addEventListener('change', collect);
    for (const input of forms.querySelectorAll('input[data-case]')) input.addEventListener('change', collect);
}

const genderLabel = (g) => ({ m: t`masculine`, f: t`feminine`, n: t`neuter`, pl: t`plural` }[g] ?? g);

function selectedMember() {
    const chars = chatCharacters();
    const sel = $id('ruinflect_member');
    const v = Number(sel?.value);
    return chars.includes(v) ? v : chars[0];
}

function renderPeople() {
    const c = ctx();
    const persona = $id('ruinflect_persona_slot');
    if (persona && !persona.contains(document.activeElement)) {
        const avatar = avatarId();
        renderPerson(persona, {
            name: c.name1,
            record: getPersonaRecord(getSettings(), avatar),
            role: 'user',
            onChange: (rec) => {
                if (!avatar) return toastr.warning(t`Could not find the current persona.`, 'RuInflect');
                setPersonaRecord(getSettings(), avatar, rec);
                save();
                onSpecChanged();
            },
        });
    }

    const chars = chatCharacters();
    const memberRow = $id('ruinflect_member_row');
    const sel = $id('ruinflect_member');
    if (sel && memberRow) {
        const current = sel.value;
        sel.replaceChildren(...chars.map((id) => new Option(c.characters[id].name, String(id))));
        if ([...sel.options].some((o) => o.value === current)) sel.value = current;
        memberRow.classList.toggle('displayNone', chars.length < 2);
    }
    const charSlot = $id('ruinflect_char_slot');
    if (charSlot && !charSlot.contains(document.activeElement)) {
        const id = selectedMember();
        const ch = id === undefined ? null : c.characters[id];
        renderPerson(charSlot, {
            name: ch?.name ?? '',
            record: ch ? getCardRecord(ch) : null,
            role: 'char',
            onChange: (rec) => saveCardRecord(id, { ...getCardRecord(ch), ...rec }),
        });
    }
    renderNativeControls();
}

function renderNativeControls() {
    const anchor = $id('persona_controls');
    if (!anchor) return;
    let box = $id('ruinflect_native_persona');
    if (!box) {
        box = element('div', 'ruinflect-row ruinflect-native');
        box.id = 'ruinflect_native_persona';
        const label = element('small', '', t`Gender for RuInflect`);
        const select = element('select', 'text_pole');
        select.id = 'ruinflect_native_gender';
        for (const [v, l] of [['', t`not set`], ['m', t`masculine (he)`], ['f', t`feminine (she)`], ['n', t`neuter (it)`], ['pl', t`plural (they)`]]) select.append(new Option(l, v));
        select.addEventListener('change', () => {
            const avatar = avatarId();
            if (!avatar) return;
            const rec = getPersonaRecord(getSettings(), avatar) ?? {};
            setPersonaRecord(getSettings(), avatar, { ...rec, gender: select.value || null });
            save();
            onSpecChanged();
        });
        box.append(label, select);
        anchor.after(box);
    }
    box.classList.toggle('displayNone', !getSettings().enabled);
    const select = $id('ruinflect_native_gender');
    if (select && document.activeElement !== select) select.value = getPersonaRecord(getSettings(), avatarId())?.gender ?? '';
}

function renderPreview() {
    const input = $id('ruinflect_preview_text');
    const out = $id('ruinflect_preview_out');
    if (!input || !out) return;
    const text = input.value;
    if (!text.trim()) {
        out.textContent = '';
        return;
    }
    const c = ctx();
    const chosen = $id('ruinflect_preview_gender')?.value || null;
    const id = selectedMember();
    const charName = id === undefined ? c.name2 : c.characters[id]?.name;
    previewGender = normalizeGender(chosen);
    try {
        out.textContent = c.substituteParams(text, c.name1, charName);
    } catch (e) {
        out.textContent = String(e);
    } finally {
        previewGender = null;
    }
}

function renderHelp() {
    const slot = $id('ruinflect_help_slot');
    if (!slot) return;
    const rows = [
        ['{{uc::дт}}  {{userCase::дт}}', t`User name in a case`, 'подходит к {{uc::дт}} → к Анне'],
        ['{{cc::вн}}  {{charCase::вн}}', t`Character name in a case`, 'смотрит на {{cc::вн}} → на Элдрина'],
        ['{{inflect::фраза::падеж::мн}}', t`Any word or noun phrase`, 'в {{inflect::Тёмный лес::пр2}} → в Тёмном лесу'],
        ['{{ug::м::ж::мн::ср}}', t`Variant for the user's gender`, 'ты {{ug::пришёл::пришла}}'],
        ['{{ug::слово}}', t`The word converted to the user's gender`, 'ты {{ug::устал}} → ты устала'],
        ['{{cg::…}}', t`The same for the character`, '{{char}} {{cg::вошёл}}'],
        ['{{userGender}}  {{charGender}}', t`Gender code: m, f, n, pl`, '{{if::{{userGender}}==f}}…{{/if}}'],
    ];
    const tableEl = element('table', 'ruinflect-help');
    for (const [macro, what, example] of rows) {
        const tr = element('tr');
        const code = element('td');
        code.append(element('code', '', macro));
        const ex = element('td');
        ex.append(element('code', '', example));
        tr.append(code, element('td', '', what), ex);
        tableEl.append(tr);
    }
    const cases = element('small', 'ruinflect-hint', t`Cases: им, рд, дт, вн, тв, пр, пр2 (в лесу), зв; also род/дат/вин/твор/пред, nom/gen/dat/acc/ins/loc and OpenCorpora tags.`);
    const card = element('small', 'ruinflect-hint', t`Players without RuInflect see these macros as plain text. Mention in the creator notes that the card needs RuInflect.`);
    slot.replaceChildren(tableEl, cases, card);
}

function updateStatus() {
    const el = $id('ruinflect_status');
    if (!el) return;
    const state = morphNow() ? t`dictionaries loaded` : { loading: t`loading dictionaries…`, failed: t`failed to load dictionaries` }[core?.state] ?? t`dictionaries not loaded yet`;
    const shared = core && core.users.length > 1 ? ` · ${t`shared with`} ${core.users.filter((u) => u !== 'RuInflect').join(', ')}` : '';
    const engine = registered === 'legacy' ? ` · ${t`legacy macro engine`}` : '';
    el.textContent = `${state}${shared} · ${t`forms`}: ${table.size}${engine}`;
}

function bindCheckbox(id, get, set, after) {
    const el = $id(id);
    el.checked = !!get();
    el.addEventListener('change', (e) => {
        set(e.target.checked);
        save();
        after?.();
    });
}

async function addSettingsUi() {
    const { renderExtensionTemplateAsync } = ctx();
    const wrapper = element('div');
    wrapper.id = 'ruinflect_container';
    wrapper.innerHTML = await renderExtensionTemplateAsync(EXT_PATH, 'templates/settings');
    ($id('extensions_settings2') ?? $id('extensions_settings')).appendChild(wrapper);
    $id('ruinflect_preview_slot').innerHTML = await renderExtensionTemplateAsync(EXT_PATH, 'templates/preview');
    personTemplate = await renderExtensionTemplateAsync(EXT_PATH, 'templates/person');

    const s = getSettings();
    $id('ruinflect_engine_warning').textContent = t`The new macro engine is off (User Settings → Experimental macro engine). Only flat macros work: {{user_datv}}, {{char_gent}}, {{user_gender}}… Turn it on and reload the page to use {{uc::дт}} and {{ug::…}}.`;
    $id('ruinflect_preview_text').placeholder = t`Text with macros, e.g. {{char}} подходит к {{uc::дт}}. — Ты {{ug::пришёл}}!`;

    bindCheckbox('ruinflect_enabled', () => s.enabled, (v) => { s.enabled = v; }, () => applyEnabled());
    bindCheckbox('ruinflect_debug', () => s.debug, (v) => { s.debug = v; });
    bindCheckbox('ruinflect_hint_enabled', () => s.hint.enabled, (v) => { s.hint.enabled = v; }, updateHint);

    const bindValue = (id, key, parse = (v) => v) => {
        const el = $id(id);
        el.value = String(s.hint[key]);
        el.addEventListener('change', () => {
            s.hint[key] = parse(el.value);
            save();
            updateHint();
        });
    };
    bindValue('ruinflect_hint_position', 'position', Number);
    bindValue('ruinflect_hint_depth', 'depth', (v) => Math.max(0, Math.min(100, parseInt(v, 10) || 0)));
    bindValue('ruinflect_hint_role', 'role', Number);
    bindValue('ruinflect_hint_user', 'userTemplate');
    bindValue('ruinflect_hint_char', 'charTemplate');
    bindValue('ruinflect_hint_wrapper', 'wrapper');
    $id('ruinflect_hint_reset').addEventListener('click', () => {
        Object.assign(s.hint, { userTemplate: DEFAULT_USER_TEMPLATE, charTemplate: DEFAULT_CHAT_TEMPLATE, wrapper: DEFAULT_WRAPPER });
        $id('ruinflect_hint_user').value = s.hint.userTemplate;
        $id('ruinflect_hint_char').value = s.hint.charTemplate;
        $id('ruinflect_hint_wrapper').value = s.hint.wrapper;
        save();
        updateHint();
    });

    $id('ruinflect_member').addEventListener('change', () => {
        renderPeople();
        renderPreview();
    });

    let typing = null;
    $id('ruinflect_preview_text').addEventListener('input', () => {
        clearTimeout(typing);
        typing = setTimeout(renderPreview, 200);
    });
    $id('ruinflect_preview_gender').addEventListener('change', renderPreview);
    $id('ruinflect_clear_cache').addEventListener('click', () => {
        table.clear();
        rebuild();
        toastr.info(t`Cache cleared.`, 'RuInflect');
    });

    renderHelp();
    renderPeople();
    updateHint();
    updateStatus();
}

function registerSlashCommands() {
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = ctx();
    if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'inflect',
        helpString: t`Declines a Russian word or phrase. The last word is the case. Example: /inflect Тёмный лес пр2`,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: t`phrase and case`, typeList: [ARGUMENT_TYPE.STRING], isRequired: true }),
        ],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'case', description: t`case, if not given as the last word`, typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'number', description: t`мн for plural`, typeList: [ARGUMENT_TYPE.STRING] }),
        ],
        returns: ARGUMENT_TYPE.STRING,
        callback: async (args, value) => {
            let text = String(value ?? '').trim();
            let code = args?.case;
            if (!code) {
                const m = text.match(/^(.*\S)\s+(\S+)$/);
                if (m && normalizeCase(m[2])) {
                    text = m[1];
                    code = m[2];
                }
            }
            const tag = normalizeCase(code);
            if (!tag) {
                toastr.warning(t`Unknown case. Use им, рд, дт, вн, тв, пр or пр2.`, 'RuInflect');
                return text;
            }
            const m = await ensureMorph();
            return inflectPhrase(text, tag, { morph: m, number: normalizeNumber(args?.number) ?? 'sing' }).text;
        },
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ruinflect-gender',
        helpString: t`Shows or sets the gender RuInflect uses. Examples: /ruinflect-gender, /ruinflect-gender user f, /ruinflect-gender char m`,
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: t`user or char`, typeList: [ARGUMENT_TYPE.STRING], enumList: ['user', 'char'] }),
            SlashCommandArgument.fromProps({ description: t`m, f, n, pl, or none to clear`, typeList: [ARGUMENT_TYPE.STRING], enumList: ['m', 'f', 'n', 'pl', 'none'] }),
        ],
        splitUnnamedArgument: true,
        returns: ARGUMENT_TYPE.STRING,
        callback: async (_args, value) => {
            const parts = (Array.isArray(value) ? value : String(value ?? '').split(/\s+/)).map((x) => String(x).trim()).filter(Boolean);
            const role = parts[0] === 'char' ? 'char' : 'user';
            const c = ctx();
            if (parts.length < 2) {
                const name = role === 'user' ? c.name1 : c.characters[selectedMember()]?.name;
                return name ? getSpec(role, name).gender ?? '' : '';
            }
            const gender = parts[1] === 'none' ? null : normalizeGender(parts[1]);
            if (parts[1] !== 'none' && !gender) {
                toastr.warning(t`Unknown gender. Use m, f, n, pl or none.`, 'RuInflect');
                return '';
            }
            if (role === 'user') {
                const avatar = avatarId();
                if (!avatar) return '';
                setPersonaRecord(getSettings(), avatar, { ...getPersonaRecord(getSettings(), avatar), gender });
                save();
                onSpecChanged();
            } else {
                const id = selectedMember();
                if (id === undefined) return '';
                saveCardRecord(id, { ...getCardRecord(c.characters[id]), gender });
            }
            return gender ?? '';
        },
    }));
}

function applyEnabled() {
    const s = getSettings();
    if (s.enabled) {
        registerMacros();
        ensureMorph().then(rebuild).catch(() => {});
    } else {
        unregisterMacros();
    }
    updateHint();
    renderNativeControls();
    updateStatus();
}

jQuery(async () => {
    const c = ctx();
    await loadPersonasModule();
    try {
        await addSettingsUi();
    } catch (e) {
        console.error(LOG, 'could not build the settings panel', e);
    }
    try {
        registerSlashCommands();
    } catch (e) {
        console.error(LOG, 'could not register slash commands', e);
    }

    if (getSettings().enabled) {
        try {
            registerMacros();
        } catch (e) {
            console.error(LOG, 'could not register macros', e);
        }
        ensureMorph().then(() => {
            rebuild();
            refreshGreeting();
        }).catch(() => {});
    }

    const ev = c.eventTypes ?? c.event_types;
    const on = (name, fn) => ev[name] && c.eventSource.on(ev[name], (...a) => {
        try {
            const r = fn(...a);
            if (r?.catch) r.catch((e) => console.error(LOG, name, e));
        } catch (e) {
            console.error(LOG, name, e);
        }
    });
    const reload = () => {
        speakingId = null;
        rebuild();
        renderPreview();
    };
    on('APP_READY', () => getSettings().enabled && ensureMorph().then(rebuild).catch(() => {}));
    on('CHAT_CHANGED', () => {
        reload();
    });
    on('PERSONA_CHANGED', reload);
    on('GROUP_UPDATED', reload);
    on('CHARACTER_EDITED', reload);
    on('CHARACTER_RENAMED', reload);
    on('SETTINGS_UPDATED', reload);
    on('GROUP_MEMBER_DRAFTED', (chId) => {
        speakingId = Number(chId);
        updateHint();
    });

    log(`v${VERSION} loaded from ${EXT_PATH}`);
});
