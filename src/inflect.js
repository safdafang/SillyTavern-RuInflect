// One form of a noun phrase, with the same agreement rules as RuMorph's expand.js.

import { CASE_FALLBACK } from './cases.js';
import { adjectiveForms, guessForms, nounForms } from './names.js';
import { CYRILLIC, applyCase } from './core/text.js';

function analyze(morph, text) {
    const lower = text.toLowerCase();
    if (!CYRILLIC.test(lower)) return { text, kind: 'fixed' };
    const cls = morph.classify(text);
    if (cls.dictionary) {
        const nouns = cls.nouns.filter((p) => p.case === 'nomn' || p.raw.tag?.Fixd);
        return { text, kind: nouns.length ? 'noun' : cls.adjs.length ? 'adj' : 'fixed', nouns, adjs: cls.adjs };
    }
    return { text, kind: 'unknown', nouns: [], adjs: [] };
}

const pickNoun = (nouns, number) => nouns.reduce((a, b) => {
    const r = (p) => (p.number === number ? 2 : 0) + (p.raw.tag?.Fixd ? 0 : 1) + p.score;
    return r(b) > r(a) ? b : a;
});

const isCapitalized = (w) => w.charAt(0) !== w.charAt(0).toLowerCase();

export function inflectPhrase(phrase, caseTag, { morph, number = 'sing' } = {}) {
    const src = String(phrase ?? '');
    if (!morph || !caseTag) return { text: src, ok: false };
    if (caseTag === 'nomn' && number === 'sing') return { text: src, ok: true };

    const pieces = src.split(/(\s+)/);
    const idx = pieces.map((p, i) => (p.trim() ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return { text: src, ok: false };
    const words = idx.map((i) => analyze(morph, pieces[i]));

    // «учёный» is a noun and an adjective; before a noun it is the adjective.
    const kinds = words.map((w, i) => {
        const next = words[i + 1];
        if (w.kind === 'noun' && w.adjs.length && next && (next.kind === 'noun' || next.kind === 'unknown')) return 'adj';
        return w.kind;
    });
    let head = kinds.findIndex((k) => k === 'noun' || k === 'unknown');
    const adjHead = head === -1;
    if (adjHead) head = kinds.findIndex((k) => k === 'adj');
    if (head === -1) return { text: src, ok: false };

    const hw = words[head];
    let headForms;
    let gender = 'masc';
    let anim = 'inan';
    if (kinds[head] === 'noun') {
        const p = pickNoun(hw.nouns, number);
        headForms = nounForms(morph, p, hw.text.toLowerCase(), { person: false, number });
        gender = p.gender === 'ms-f' ? 'masc' : p.gender || 'masc';
        anim = p.anim || 'inan';
        if (p.raw.tag?.Pltm) number = 'plur';
    } else if (kinds[head] === 'unknown') {
        headForms = guessForms(hw.text.toLowerCase(), null).forms;
        gender = /[ая]$/i.test(hw.text) ? 'femn' : 'masc';
        anim = 'anim';
    } else {
        const p = hw.adjs[0];
        gender = p.gender || 'masc';
        headForms = adjectiveForms(morph, p, { gender, number });
    }
    if (!headForms) return { text: src, ok: false };

    const pick = (forms, c) => forms?.[c] ?? forms?.[CASE_FALLBACK[c]];
    const adjCase = caseTag === 'accs' && anim === 'anim' && (gender === 'masc' || number === 'plur') ? 'gent' : caseTag;
    const out = [...pieces];
    let ok = true;
    let frozen = false;
    words.forEach((w, i) => {
        let form = null;
        if (i === head) {
            form = pick(headForms, caseTag);
        } else if (i < head && kinds[i] === 'adj') {
            const p = w.adjs[0];
            form = pick(adjectiveForms(morph, p, { gender, number }), adjCase);
        } else if (i > head && !frozen && kinds[i] === 'noun' && isCapitalized(w.text) && w.nouns.some((p) => p.case === 'nomn')) {
            const p = pickNoun(w.nouns, number);
            form = pick(nounForms(morph, p, w.text.toLowerCase(), { person: false, number }), caseTag);
        }
        if (i > head && !form) frozen = true;
        if (i === head && !form) ok = false;
        if (form) out[idx[i]] = applyCase(form, w.text);
    });
    return { text: out.join(''), ok };
}
