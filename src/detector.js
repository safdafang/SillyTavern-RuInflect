// Conservative: anything but a particle or one adverb between the subject and
// the verb stops the check («ты знал, что она пришла», «ты, говорят, пришёл»).

import { genderedParses, genderOfParse, formForGender } from './gender.js';
import { applyCase, matchYo } from './core/text.js';

const TOKEN = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*|[A-Za-z]+|\d+|[^\sА-Яа-яЁёA-Za-z\d]/g;
// Markdown emphasis does not separate words.
const TRANSPARENT = new Set(['*', '_', '~']);
const SENTENCE = new Set(['.', '!', '?', '…', ':', ';', '«', '"', '„', '“', '—', '–', '(', '[']);
const PARTICLES = new Set(['не', 'же', 'ж', 'ведь', 'бы', 'б', 'ли', 'уж', 'вот', 'даже', 'тоже', 'также', 'всё-таки', 'все-таки', 'таки']);

export function tokenize(text) {
    const out = [];
    for (const m of text.matchAll(TOKEN)) {
        if (TRANSPARENT.has(m[0])) continue;
        out.push({ text: m[0], start: m.index, end: m.index + m[0].length, word: /^[А-Яа-яЁё]/.test(m[0]) });
    }
    return out;
}

function isAdverbOnly(morph, word) {
    const dict = morph.parse(word.toLowerCase()).filter((p) => p.dictionary);
    return dict.length > 0 && dict.every((p) => p.pos === 'ADVB' || p.pos === 'PRCL');
}

export function unambiguousGender(morph, word) {
    const lower = word.toLowerCase();
    const dict = morph.parse(lower).filter((p) => p.dictionary);
    if (!dict.length) return null;
    const gendered = genderedParses(morph, lower).filter((p) => p.pos === 'VERB' || p.pos === 'ADJS' || p.pos === 'PRTS');
    if (gendered.length !== dict.length) return null;
    const genders = new Set(gendered.map(genderOfParse));
    if (genders.size !== 1) return null;
    const g = [...genders][0];
    return g && g !== 'pl' ? { gender: g, parse: gendered[0] } : null;
}

function predicateAfter(tokens, i, morph) {
    let adverbs = 0;
    let skipped = 0;
    for (let j = i + 1; j < tokens.length && skipped <= 2; j++) {
        const tok = tokens[j];
        if (!tok.word) return null;
        const lower = tok.text.toLowerCase();
        if (PARTICLES.has(lower)) {
            skipped++;
            continue;
        }
        const g = unambiguousGender(morph, tok.text);
        if (g) return { index: j, ...g };
        if (adverbs === 0 && isAdverbOnly(morph, tok.text)) {
            adverbs++;
            skipped++;
            continue;
        }
        return null;
    }
    return null;
}

const atSentenceStart = (text, tokens, i) => {
    if (i === 0) return true;
    const prev = tokens[i - 1];
    if (SENTENCE.has(prev.text)) return true;
    return text.slice(prev.end, tokens[i].start).includes('\n');
};

export function detectGenderErrors(text, { morph, userGender, userNames = [], charGender = null, firstPerson = false } = {}) {
    if (!morph || !text) return [];
    const tokens = tokenize(String(text));
    const issues = [];
    const seen = new Set();
    const names = userNames.filter(Boolean).map((n) => n.split(/\s+/).filter(Boolean)).filter((n) => n.length);

    const flag = (pred, gender, rule) => {
        if (!pred || !gender || pred.gender === gender || seen.has(pred.index)) return;
        const tok = tokens[pred.index];
        const target = formForGender(morph, pred.parse, gender);
        if (!target) return;
        seen.add(pred.index);
        issues.push({
            start: tok.start,
            end: tok.end,
            word: tok.text,
            fix: matchYo(applyCase(target, tok.text), tok.text, String(pred.parse.raw)),
            rule,
        });
    };

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!tok.word) continue;
        const lower = tok.text.toLowerCase();

        if (lower === 'ты' && userGender && userGender !== 'pl') {
            flag(predicateAfter(tokens, i, morph), userGender, 'ty');
            continue;
        }
        if (lower === 'я' && firstPerson && charGender && charGender !== 'pl') {
            flag(predicateAfter(tokens, i, morph), charGender, 'ya');
            continue;
        }
        if (userGender && atSentenceStart(text, tokens, i)) {
            for (const parts of names) {
                if (parts.every((p, k) => tokens[i + k]?.text === p)) {
                    const last = i + parts.length - 1;
                    const pred = predicateAfter(tokens, last, morph);
                    if (userGender === 'pl') {
                        if (pred) flag({ ...pred, gender: pred.gender }, 'pl', 'name');
                    } else {
                        flag(pred, userGender, 'name');
                    }
                    break;
                }
            }
        }
    }
    return issues.sort((a, b) => a.start - b.start);
}

export function applyFixes(text, issues) {
    let out = String(text);
    for (const it of [...issues].sort((a, b) => b.start - a.start)) {
        if (out.slice(it.start, it.end) === it.word) out = out.slice(0, it.start) + it.fix + out.slice(it.end);
    }
    return out;
}
