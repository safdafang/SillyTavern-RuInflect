// пришёл → пришла / пришло / пришли, готов → готова, уставший → уставшая

import { AZ_GENDER, normalizeGender } from './names.js';
import { CYRILLIC, applyCase, matchYo } from './core/text.js';

const RARE = ['V-oy', 'V-ey', 'Infr', 'Arch', 'Dist', 'Erro', 'Slng'];
const FROM_AZ = { masc: 'm', femn: 'f', neut: 'n' };

// Verbs win over homonyms: «пришла» is also a short form of «пришлый».
const PRIORITY = { VERB: 0, ADJS: 1, PRTS: 2, PRTF: 3, ADJF: 4 };

function isGendered(p) {
    const t = p.raw.tag;
    switch (p.pos) {
        case 'VERB':
            return t.TEns === 'past';
        case 'ADJS':
        case 'PRTS':
            return true;
        case 'ADJF':
        case 'PRTF':
            return t.CAse === 'nomn';
        default:
            return false;
    }
}

export function genderedParses(morph, word) {
    return morph.parse(word.toLowerCase())
        .filter((p) => p.dictionary && p.pos in PRIORITY && isGendered(p))
        .sort((a, b) => PRIORITY[a.pos] - PRIORITY[b.pos] || b.score - a.score);
}

export function genderOfParse(p) {
    if (p.raw.tag.NMbr === 'plur') return 'pl';
    return FROM_AZ[p.raw.tag.GNdr] ?? null;
}

function sameLexemeForm(p) {
    const t = p.raw.tag;
    switch (p.pos) {
        case 'VERB':
            return (tag) => tag.POST === 'VERB' && tag.TEns === 'past' && tag.MOod === t.MOod;
        case 'ADJS':
            return (tag) => tag.POST === 'ADJS';
        case 'PRTS':
            return (tag) => tag.POST === 'PRTS' && tag.TEns === t.TEns && tag.VOic === t.VOic;
        case 'PRTF':
            return (tag) => tag.POST === 'PRTF' && tag.CAse === 'nomn' && tag.TEns === t.TEns && tag.VOic === t.VOic && tag.ASpc === t.ASpc;
        default:
            return (tag) => tag.POST === 'ADJF' && tag.CAse === 'nomn' && !!tag.Supr === !!t.Supr && !!tag.Apro === !!t.Apro;
    }
}

export function formForGender(morph, p, gender) {
    const g = normalizeGender(gender);
    if (!g) return null;
    const number = g === 'pl' ? 'plur' : 'sing';
    const same = sameLexemeForm(p);
    let best = null;
    for (const f of morph.paradigm(p)) {
        const t = f.tag;
        if (!same(t) || t.NMbr !== number) continue;
        if (number === 'sing' && t.GNdr !== AZ_GENDER[g]) continue;
        if (t.ANim === 'anim' && t.CAse === 'accs') continue;
        const rare = RARE.some((r) => t[r]);
        if (!best || (best.rare && !rare)) best = { word: f.word, rare };
    }
    return best?.word ?? null;
}

export function wordToGender(word, gender, morph, { fullAdjectives = true } = {}) {
    if (!morph || !CYRILLIC.test(word)) return { text: word, ok: false, from: null };
    for (const p of genderedParses(morph, word)) {
        if (!fullAdjectives && (p.pos === 'ADJF' || p.pos === 'PRTF') && !p.raw.tag.Apro) continue;
        const target = formForGender(morph, p, gender);
        if (!target) continue;
        const from = genderOfParse(p);
        if (from === normalizeGender(gender)) return { text: word, ok: true, from };
        return { text: matchYo(applyCase(target, word), word, String(p.raw)), ok: true, from };
    }
    return { text: word, ok: false, from: null };
}

const WORD = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;

export function toGender(text, gender, morph) {
    const src = String(text ?? '');
    const words = src.match(WORD) ?? [];
    if (words.length === 1 && src.trim() === words[0]) {
        const r = wordToGender(words[0], gender, morph);
        return { text: r.text, converted: r.ok ? 1 : 0, words: 1 };
    }
    let converted = 0;
    const out = src.replace(WORD, (w) => {
        const r = wordToGender(w, gender, morph, { fullAdjectives: false });
        if (r.ok) converted++;
        return r.text;
    });
    return { text: out, converted, words: words.length };
}

export function pickVariant(variants, gender) {
    const [m = '', f = m, pl, n] = variants;
    switch (normalizeGender(gender)) {
        case 'f':
            return { text: f, warning: null };
        case 'pl':
            return pl === undefined ? { text: m, warning: 'no plural variant, the masculine one is used' } : { text: pl, warning: null };
        case 'n':
            return { text: n ?? m, warning: null };
        default:
            return { text: m, warning: null };
    }
}
