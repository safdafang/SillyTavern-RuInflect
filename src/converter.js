import { formForGender } from './gender.js';
import { unambiguousGender } from './detector.js';

export const CONVERT_FIELDS = [
    'description', 'personality', 'scenario', 'first_mes', 'alternate_greetings',
    'mes_example', 'system_prompt', 'post_history_instructions',
];
export const TOP_LEVEL_FIELDS = ['description', 'personality', 'scenario', 'first_mes', 'mes_example'];

// `low`: the preposition also takes another case with people.
const PREPOSITIONS = {
    datv: { high: ['к', 'ко'], low: ['по'] },
    gent: { high: ['у', 'от', 'ото', 'до', 'из', 'изо', 'без', 'безо', 'для', 'около', 'возле', 'вокруг', 'после', 'кроме', 'мимо', 'среди', 'напротив', 'вместо', 'ради', 'позади', 'против', 'вроде', 'вне', 'внутри', 'посреди', 'насчёт', 'насчет', 'ввиду'], low: [] },
    ablt: { high: ['с', 'со', 'над', 'надо', 'под', 'подо', 'перед', 'передо', 'пред', 'между', 'меж'], low: ['за'] },
    loct: { high: ['о', 'об', 'обо', 'при'], low: [] },
    accs: { high: ['про', 'через', 'сквозь', 'сквозь'], low: ['в', 'во', 'на'] },
};
const PREP = new Map();
for (const [c, { high, low }] of Object.entries(PREPOSITIONS)) {
    for (const p of high) PREP.set(p, { case: c, confidence: 'high' });
    for (const p of low) PREP.set(p, { case: c, confidence: 'low' });
}

// Verbs of speech are left out: «— Привет, — говорит {{user}}».
const DATIVE_VERBS = new Set([
    'помогать', 'помочь', 'улыбаться', 'улыбнуться', 'кивать', 'кивнуть', 'писать', 'написать', 'давать', 'дать',
    'дарить', 'подарить', 'звонить', 'позвонить', 'нравиться', 'понравиться', 'подмигивать', 'подмигнуть', 'махать',
    'помахать', 'протягивать', 'протянуть', 'показывать', 'показать', 'объяснять', 'объяснить', 'доверять', 'довериться',
    'верить', 'поверить', 'мешать', 'помешать', 'служить', 'послужить', 'принадлежать', 'угрожать', 'пригрозить',
    'сообщать', 'сообщить', 'предлагать', 'предложить', 'разрешать', 'разрешить', 'запрещать', 'запретить', 'обещать',
    'пообещать', 'отдавать', 'отдать', 'передавать', 'передать', 'завидовать', 'позавидовать', 'кланяться', 'поклониться',
    'аплодировать', 'сочувствовать', 'посочувствовать', 'радоваться', 'обрадоваться', 'грозить', 'приказывать', 'приказать',
    'советовать', 'посоветовать', 'возвращать', 'вернуть', 'надоедать', 'надоесть', 'льстить', 'польстить', 'подражать',
]);
const ACCUSATIVE_VERBS = new Set([
    'видеть', 'увидеть', 'любить', 'полюбить', 'знать', 'узнать', 'узнавать', 'ждать', 'подождать', 'дождаться', 'обнимать',
    'обнять', 'целовать', 'поцеловать', 'звать', 'позвать', 'слышать', 'услышать', 'встречать', 'встретить', 'искать', 'найти',
    'находить', 'держать', 'удерживать', 'толкать', 'толкнуть', 'хватать', 'схватить', 'тянуть', 'потянуть', 'бить', 'ударить',
    'будить', 'разбудить', 'кусать', 'укусить', 'гладить', 'погладить', 'трогать', 'тронуть', 'пугать', 'напугать',
    'ненавидеть', 'благодарить', 'поблагодарить', 'вести', 'повести', 'тащить', 'потащить', 'нести', 'понести', 'замечать',
    'заметить', 'оглядывать', 'оглядеть', 'осматривать', 'осмотреть', 'рассматривать', 'разглядывать', 'дразнить',
    'подразнить', 'утешать', 'утешить', 'спасать', 'спасти', 'защищать', 'защитить', 'отпускать', 'отпустить', 'провожать',
    'проводить', 'приветствовать', 'поприветствовать', 'обманывать', 'обмануть', 'игнорировать', 'прижимать', 'прижать',
    'поднимать', 'поднять', 'усаживать', 'усадить', 'укладывать', 'уложить', 'щекотать', 'пощекотать', 'тормошить',
]);

const NAME = /\{\{\s*(user|char)\s*\}\}/gi;

function macroSpans(text) {
    const spans = [];
    for (const m of text.matchAll(/\{\{[^{}]*\}\}/g)) spans.push([m.index, m.index + m[0].length]);
    return spans;
}

function previousWord(text, pos) {
    const before = text.slice(0, pos);
    const m = before.match(/([А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*)(\s+)$/);
    if (!m) return null;
    const start = before.length - m[0].length;
    return { text: m[1], start, before: text.slice(0, start) };
}

const macroFor = (role, c) => `{{${role === 'user' ? 'uc' : 'cc'}::${{ nomn: 'им', gent: 'рд', datv: 'дт', accs: 'вн', ablt: 'тв', loct: 'пр' }[c]}}}`;

// «{{user}}у», «{{char}}ом»
const SUFFIX_CASE = {
    а: 'gent', я: 'gent', ы: 'gent', и: 'gent',
    у: 'datv', ю: 'datv', е: 'datv',
    ом: 'ablt', ем: 'ablt', ём: 'ablt', ой: 'ablt', ей: 'ablt', ою: 'ablt', ею: 'ablt',
};

function verbCase(morph, word) {
    const parses = morph.parse(word.toLowerCase()).filter((p) => p.dictionary && ['VERB', 'INFN', 'GRND'].includes(p.pos));
    if (!parses.length) return null;
    const lemmas = parses.map((p) => p.lemma.toLowerCase());
    if (lemmas.some((l) => DATIVE_VERBS.has(l))) return { case: 'datv', confidence: 'high' };
    if (lemmas.some((l) => ACCUSATIVE_VERBS.has(l))) return { case: 'accs', confidence: 'high' };
    return null;
}

export function scanText(text, { morph }) {
    const src = String(text ?? '');
    const out = [];
    const taken = new Set();
    const add = (s) => {
        for (let i = s.start; i < s.end; i++) if (taken.has(i)) return;
        for (let i = s.start; i < s.end; i++) taken.add(i);
        out.push(s);
    };

    for (const m of src.matchAll(NAME)) {
        const role = m[1].toLowerCase();
        const start = m.index;
        let end = start + m[0].length;
        const glued = src.slice(end).match(/^[а-яё]{1,2}(?![а-яё])/i);
        const prev = previousWord(src, start);
        const prep = prev && PREP.get(prev.text.toLowerCase());
        let found = null;
        if (glued) {
            end += glued[0].length;
            const byPrep = prep?.case;
            const bySuffix = SUFFIX_CASE[glued[0].toLowerCase()];
            found = { case: byPrep ?? bySuffix, confidence: byPrep || bySuffix === 'ablt' ? 'high' : 'low', reason: `«${m[0]}${glued[0]}»` };
            if (!found.case) continue;
        } else if (prep) {
            found = { ...prep, reason: `«${prev.text} ${m[0]}»` };
        } else if (prev && morph) {
            // «— …, — улыбается {{char}}»
            if (/[—–-]\s*$/.test(prev.before)) continue;
            const v = verbCase(morph, prev.text);
            if (v) found = { ...v, reason: `«${prev.text} ${m[0]}»` };
        }
        if (!found) continue;
        add({
            start, end, before: src.slice(start, end), after: macroFor(role, found.case),
            kind: 'case', confidence: found.confidence, reason: found.reason,
        });
    }

    if (morph) {
        const spans = macroSpans(src);
        const inMacro = (i) => spans.some(([a, b]) => i > a && i < b);
        const subjects = [];
        for (const m of src.matchAll(/(?<![А-Яа-яЁё-])[Тт]ы(?![А-Яа-яЁё-])/g)) subjects.push({ end: m.index + m[0].length, what: m[0] });
        for (const m of src.matchAll(/\{\{\s*user\s*\}\}(?![А-Яа-яЁё])/gi)) subjects.push({ end: m.index + m[0].length, what: m[0] });
        for (const s of subjects) {
            const rest = src.slice(s.end);
            const lead = rest.match(/^[\s*_]*(?:(?:не|же|ведь|бы|уже|ещё|тоже|снова|опять|наконец)[\s*_]+)?/i)[0];
            const w = rest.slice(lead.length).match(/^[А-Яа-яЁё]+/);
            if (!w) continue;
            const start = s.end + lead.length;
            if (inMacro(start)) continue;
            const g = unambiguousGender(morph, w[0]);
            if (!g || g.gender === 'n') continue;
            const masc = g.gender === 'm' ? w[0] : formForGender(morph, g.parse, 'm');
            if (!masc) continue;
            const base = g.gender === 'm' ? w[0] : (w[0][0] === w[0][0].toUpperCase() ? masc[0].toUpperCase() + masc.slice(1) : masc);
            add({
                start, end: start + w[0].length, before: w[0], after: `{{ug::${base}}}`,
                kind: 'gender', confidence: 'high', reason: `«${s.what} ${w[0]}»`,
            });
        }
    }
    return out.sort((a, b) => a.start - b.start);
}

export function readFields(character) {
    const d = character?.data ?? {};
    const out = {};
    for (const f of CONVERT_FIELDS) {
        if (f === 'alternate_greetings') out[f] = Array.isArray(d.alternate_greetings) ? [...d.alternate_greetings] : [];
        else out[f] = String(d[f] ?? character?.[f] ?? '');
    }
    return out;
}

export function scanCard(character, { morph }) {
    const fields = readFields(character);
    const all = [];
    for (const f of CONVERT_FIELDS) {
        const values = f === 'alternate_greetings' ? fields[f] : [fields[f]];
        values.forEach((value, index) => {
            for (const s of scanText(value, { morph })) {
                all.push({ ...s, field: f, index: f === 'alternate_greetings' ? index : null, id: `${f}:${index}:${s.start}` });
            }
        });
    }
    return all;
}

export function applyToText(text, suggestions) {
    let out = String(text);
    for (const s of [...suggestions].sort((a, b) => b.start - a.start)) {
        if (out.slice(s.start, s.end) === s.before) out = out.slice(0, s.start) + s.after + out.slice(s.end);
    }
    return out;
}

export function applyToFields(fields, chosen) {
    const out = structuredClone(fields);
    for (const f of CONVERT_FIELDS) {
        const mine = chosen.filter((s) => s.field === f);
        if (!mine.length) continue;
        if (f === 'alternate_greetings') {
            out[f] = out[f].map((v, i) => applyToText(v, mine.filter((s) => s.index === i)));
        } else {
            out[f] = applyToText(out[f], mine);
        }
    }
    return out;
}

export function context(text, s, width = 30) {
    const a = Math.max(0, s.start - width);
    const b = Math.min(text.length, s.end + width);
    return { pre: (a > 0 ? '…' : '') + text.slice(a, s.start), post: text.slice(s.end, b) + (b < text.length ? '…' : '') };
}
