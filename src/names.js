// Declension of a person's name: one form per case. Manual forms first, then the
// dictionary (proper names first), then one paradigm picked by gender and ending.

import { ALL_CASES, CASE_FALLBACK } from './cases.js';
import { caseOf } from './core/morph.js';
import {
    firstA, firstYa, masculineHard, masculineJ, newTable, slotKey, softFeminine, softMasculine,
} from './core/paradigms.js';
import { CYRILLIC, applyCase } from './core/text.js';

export const GENDERS = ['m', 'f', 'n', 'pl'];
export const AZ_GENDER = { m: 'masc', f: 'femn', n: 'neut' };
const FROM_AZ = { masc: 'm', femn: 'f', neut: 'n' };

const GENDER_ALIASES = {
    m: ['m', 'м', 'муж', 'мужской', 'male', 'masc', 'man', 'he', 'он'],
    f: ['f', 'ж', 'жен', 'женский', 'female', 'femn', 'fem', 'woman', 'she', 'она'],
    n: ['n', 'ср', 'с', 'средний', 'neut', 'neuter', 'it', 'оно'],
    pl: ['pl', 'мн', 'множ', 'множественное', 'plur', 'plural', 'they', 'они'],
};
const GENDER_LOOKUP = new Map(Object.entries(GENDER_ALIASES).flatMap(([g, list]) => list.map((a) => [a, g])));

export function normalizeGender(code) {
    return GENDER_LOOKUP.get(String(code ?? '').trim().toLowerCase().replace(/\.$/, '')) ?? null;
}

const VOWELS = 'аеёиоуыэюя';
const HUSHING_TS = 'жшщчц';
const RARE = ['V-oy', 'V-ey', 'V-be', 'V-en', 'V-ie', 'V-bi', 'Infr', 'Arch', 'Dist', 'Erro', 'Slng', 'Litr'];
const PROPER = /\b(Name|Surn|Patr)\b/;
const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const last = (s) => s.charAt(s.length - 1);
const isRare = (tag) => RARE.some((g) => tag[g]);

function fixedForms(word) {
    return Object.fromEntries(ALL_CASES.map((c) => [c, word]));
}

function fillFallbacks(forms) {
    for (const c of ALL_CASES) {
        if (!forms[c]) forms[c] = forms[CASE_FALLBACK[c]] ?? forms.nomn;
    }
    return forms;
}

function pickFromParadigm(morph, info, accept, prefer = () => 0) {
    const best = {};
    for (const f of morph.paradigm(info)) {
        if (!accept(f.tag)) continue;
        const c = caseOf(f.tag);
        if (!c) continue;
        const rank = (isRare(f.tag) ? 10 : 0) + prefer(f.tag);
        if (!best[c] || rank < best[c].rank) best[c] = { word: f.word, rank };
    }
    return Object.fromEntries(Object.entries(best).map(([c, v]) => [c, v.word]));
}

export function guessGender(word) {
    const w = word.toLowerCase();
    const l = last(w);
    if (l === 'а' || l === 'я') return 'f';
    if (l === 'ь') return 'm';
    if (VOWELS.includes(l)) return null;
    return CYRILLIC.test(l) ? 'm' : null;
}

export function guessForms(word, gender, { surname = false } = {}) {
    const l = last(word);
    const g = gender === 'pl' ? 'm' : gender;
    const s = word.slice(0, -1);
    if (!CYRILLIC.test(word) || word.length < 2) return { forms: fixedForms(word), type: 'indeclinable' };

    if (surname && g !== 'f' && /(ов|ев|ёв|ин|ын)$/.test(word)) {
        return {
            type: 'surname',
            forms: fillFallbacks({ nomn: word, gent: word + 'а', datv: word + 'у', accs: word + 'а', ablt: word + 'ым', loct: word + 'е' }),
        };
    }
    if (surname && g !== 'm' && /(ова|ева|ёва|ина|ына)$/.test(word)) {
        return {
            type: 'surname-f',
            forms: fillFallbacks({ nomn: word, gent: s + 'ой', datv: s + 'ой', accs: s + 'у', ablt: s + 'ой', loct: s + 'ой' }),
        };
    }

    const table = newTable();
    let type;
    if (l === 'а') {
        firstA(word, table);
        type = '1st-a';
    } else if (l === 'я') {
        firstYa(word, table);
        type = '1st-ya';
    } else if (l === 'ь') {
        if (g === 'f') {
            softFeminine(word, table);
            type = '3rd-fem';
        } else {
            softMasculine(word, table);
            type = 'masc-soft';
        }
    } else if (VOWELS.includes(l) || l === 'ъ') {
        return { forms: fixedForms(word), type: 'indeclinable' };
    } else if (g === 'f' || g === 'n') {
        // Feminine names ending in a consonant do not decline: «к Эстер».
        return { forms: fixedForms(word), type: 'indeclinable' };
    } else if (l === 'й') {
        masculineJ(word, table);
        type = 'masc-j';
    } else {
        masculineHard(word, table);
        type = 'masc-hard';
    }

    const forms = {};
    for (const c of ALL_CASES) {
        const set = table.get(slotKey(c, 'sing'));
        if (set?.size) forms[c] = [...set][0];
    }
    // Unstressed endings after ж ш щ ч ц are spelled with «е»: Сашей, Ковашем.
    if (HUSHING_TS.includes(last(s)) && (type === '1st-a')) forms.ablt = s + 'ей';
    if (HUSHING_TS.includes(l) && type === 'masc-hard') forms.ablt = word + 'ем';
    return { forms: fillFallbacks(forms), type };
}

export function dictionaryNouns(morph, word) {
    return morph.parse(capitalize(word)).filter((p) => p.dictionary && p.pos === 'NOUN' && (p.case === 'nomn' || p.raw.tag?.Fixd));
}

function genderFits(p, gender) {
    if (!gender || gender === 'n' || gender === 'pl') return true;
    return p.gender === AZ_GENDER[gender] || p.gender === 'ms-f' || !!p.raw.tag?.['Ms-f'];
}

function chooseNoun(nouns, gender) {
    const fitting = nouns.filter((p) => genderFits(p, gender));
    if (!fitting.length) return null;
    const rank = (p) => (PROPER.test(p.tag) ? 4 : 0) + (p.anim === 'anim' ? 2 : 0) + (p.number === 'sing' ? 1 : 0) + p.score;
    return fitting.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

export function nounForms(morph, p, word, { person = true, number } = {}) {
    if (p.raw.tag?.Fixd) return fixedForms(word);
    const patr = !!p.raw.tag?.Patr;
    const n = p.raw.tag?.Pltm || p.raw.tag?.Sgtm ? (p.number || 'sing') : number ?? p.number ?? 'sing';
    const forms = pickFromParadigm(morph, p, (tag) => tag.POST === 'NOUN' && !!tag.Patr === patr && tag.NMbr === n);
    if (!forms.nomn) return fixedForms(word);
    const secondDecl = p.gender === 'masc' && !/[ая]$/.test(word);
    if (person && p.anim !== 'anim' && (secondDecl || n === 'plur') && forms.gent) forms.accs = forms.gent;
    return fillFallbacks(forms);
}

export function adjectiveParses(morph, word) {
    return morph.parse(capitalize(word)).filter((p) => p.dictionary && (p.pos === 'ADJF' || p.pos === 'PRTF') && p.case === 'nomn');
}

export function adjectiveForms(morph, p, { gender = 'masc', number = 'sing' } = {}) {
    const t = p.raw.tag;
    const same = p.pos === 'PRTF'
        ? (tag) => tag.POST === 'PRTF' && tag.TEns === t.TEns && tag.VOic === t.VOic && tag.ASpc === t.ASpc
        : (tag) => tag.POST === 'ADJF' && !!tag.Supr === !!t.Supr;
    const forms = pickFromParadigm(
        morph,
        p,
        (tag) => same(tag) && tag.NMbr === number && (number === 'plur' || tag.GNdr === gender),
        (tag) => (tag.inan ? 1 : 0),
    );
    return forms.nomn ? fillFallbacks(forms) : null;
}

export function declineWord(text, ctx) {
    const lower = text.toLowerCase();
    const base = { text };
    if (!CYRILLIC.test(lower)) return { ...base, forms: fixedForms(lower), source: 'latin', type: 'latin' };

    const parts = lower.split('-');
    if (parts.length > 1 && parts.every(Boolean)) {
        const infos = parts.map((p) => declineWord(p, ctx));
        const forms = Object.fromEntries(ALL_CASES.map((c) => [c, infos.map((i) => i.forms[c]).join('-')]));
        const source = infos.some((i) => i.source === 'guess') ? 'guess' : infos[0].source;
        return { ...base, forms, source, type: 'hyphenated', inferredGender: infos.find((i) => i.inferredGender)?.inferredGender ?? null };
    }

    if (!ctx.morph) return { ...base, forms: fixedForms(lower), source: 'pending', type: 'pending' };

    const nouns = dictionaryNouns(ctx.morph, lower);
    if (ctx.asAdjective || !nouns.length) {
        const adjs = adjectiveParses(ctx.morph, lower);
        if (adjs.length) {
            const g = ctx.gender === 'pl' ? null : AZ_GENDER[ctx.gender] ?? 'masc';
            const forms = adjectiveForms(ctx.morph, adjs[0], { gender: g ?? 'masc', number: ctx.gender === 'pl' ? 'plur' : 'sing' });
            if (forms) return { ...base, forms, source: 'dictionary', type: 'adjective', inferredGender: FROM_AZ[adjs[0].gender] ?? null };
        }
    }
    const noun = chooseNoun(nouns, ctx.gender);
    if (noun) {
        const msf = noun.gender === 'ms-f' || !!noun.raw.tag?.['Ms-f'];
        return {
            ...base,
            forms: nounForms(ctx.morph, noun, lower),
            source: 'dictionary',
            type: noun.raw.tag?.Fixd ? 'indeclinable' : 'noun',
            inferredGender: msf ? null : FROM_AZ[noun.gender] ?? null,
            ambiguousGender: msf,
            tag: noun.tag,
        };
    }
    const gender = ctx.gender ?? guessGender(lower);
    const { forms, type } = guessForms(lower, gender, { surname: ctx.surname });
    return { ...base, forms, source: 'guess', type, inferredGender: ctx.gender ? null : gender };
}

export function declineName(name, { morph, gender = null, forms: manual = {} } = {}) {
    const original = String(name ?? '');
    const given = normalizeGender(gender);
    const pieces = original.split(/(\s+)/);
    const wordIdx = pieces.map((p, i) => (p.trim() ? i : -1)).filter((i) => i >= 0);

    let g = given;
    let words = [];
    // «Кай Таров» has a surname, «Лорд Элдрин» does not.
    const run = () => wordIdx.reduce((acc, idx, n) => {
        const nextIsWord = n < wordIdx.length - 1 && CYRILLIC.test(pieces[wordIdx[n + 1]]);
        const text = pieces[idx];
        const prev = acc[n - 1];
        acc.push(declineWord(text, {
            morph,
            gender: g,
            surname: !!prev && /\bName\b/.test(prev.tag ?? ''),
            asAdjective: nextIsWord && !!morph && adjectiveParses(morph, text.toLowerCase()).length > 0 && !dictionaryNouns(morph, text.toLowerCase()).some((p) => PROPER.test(p.tag)),
        }));
        return acc;
    }, []);
    words = run();
    let uncertain = false;
    if (!g) {
        const known = words.find((w) => w.source === 'dictionary' && w.inferredGender && w.type !== 'adjective')
            ?? words.find((w) => w.inferredGender);
        if (known) {
            g = known.inferredGender;
            if (words.length > 1) words = run();
        }
        uncertain = !known || known.source !== 'dictionary' || !!known.ambiguousGender;
    }

    const forms = {};
    const sources = {};
    const auto = {};
    for (const c of ALL_CASES) {
        const out = [...pieces];
        words.forEach((w, n) => {
            out[wordIdx[n]] = applyCase(w.forms[c] ?? w.text.toLowerCase(), w.text);
        });
        auto[c] = out.join('');
        const m = typeof manual?.[c] === 'string' ? manual[c].trim() : '';
        forms[c] = m || auto[c];
        sources[c] = m ? 'manual' : summarize(words);
    }
    if (!manual?.nomn) {
        forms.nomn = original;
        sources.nomn = summarize(words);
    }
    const anyManual = Object.values(sources).includes('manual');
    return {
        name: original,
        gender: g,
        genderGiven: !!given,
        uncertain,
        source: anyManual ? 'manual' : summarize(words),
        forms,
        auto,
        sources,
        words: words.map(({ text, source, type, tag }) => ({ text, source, type, tag })),
    };
}

function summarize(words) {
    if (!words.length) return 'latin';
    if (words.some((w) => w.source === 'pending')) return 'pending';
    if (words.some((w) => w.source === 'guess')) return 'guess';
    if (words.every((w) => w.source === 'latin')) return 'latin';
    return 'dictionary';
}
