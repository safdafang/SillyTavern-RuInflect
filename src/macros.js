import { normalizeCase, normalizeNumber } from './cases.js';
import { pickVariant, toGender } from './gender.js';
import { inflectPhrase } from './inflect.js';

export const CATEGORY = 'RuInflect';
const LOG = '[RuInflect]';

const warn = (c, message) => {
    if (typeof c?.warn === 'function') c.warn(message);
    else console.warn(LOG, message);
};

const roleName = (c, role, deps) => {
    const n = c?.env?.names?.[role];
    return typeof n === 'string' && n ? n : deps.fallbackName?.(role) ?? '';
};

export function caseOf(role, caseArg, deps, c) {
    const name = roleName(c, role, deps);
    if (!name) return '';
    const tag = normalizeCase(caseArg ?? 'им');
    if (!tag) {
        warn(c, `unknown case "${caseArg}", the nominative is used`);
        return name;
    }
    const e = deps.entry(role, name);
    if (!e) {
        warn(c, `forms of "${name}" are not ready yet (dictionaries are loading), the nominative is used`);
        return name;
    }
    return e.forms[tag] ?? name;
}

export function genderSelect(role, args, deps, c) {
    const name = roleName(c, role, deps);
    const gender = deps.gender(role, name);
    if (args.length <= 1) {
        const word = args[0] ?? '';
        if (!gender || !word) return word;
        const morph = deps.morph();
        if (!morph) {
            warn(c, 'dictionaries are not loaded yet, the word is used as is');
            return word;
        }
        const r = toGender(word, gender, morph);
        if (!r.converted) warn(c, `"${word}" has no gendered forms in the dictionary, it is used as is`);
        return r.text;
    }
    const { text, warning } = pickVariant(args, gender);
    if (warning) warn(c, warning);
    return text;
}

export function createMacroDefinitions(deps) {
    const t = deps.t ?? ((s, ...v) => s.reduce((a, x, i) => a + x + (i < v.length ? v[i] : ''), ''));
    const caseArg = {
        name: 'case',
        optional: true,
        defaultValue: 'им',
        sampleValue: 'дт',
        description: t`Case: им, рд, дт, вн, тв, пр, пр2 (also nom/gen/dat/acc/ins/loc or OpenCorpora tags)`,
    };
    const genderArgs = [
        { name: 'masculine', sampleValue: 'пришёл', description: t`Masculine form, or the only form to convert automatically` },
        { name: 'feminine', optional: true, sampleValue: 'пришла', description: t`Feminine form` },
        { name: 'plural', optional: true, sampleValue: 'пришли', description: t`Plural form (they); the masculine one if missing` },
        { name: 'neuter', optional: true, sampleValue: 'пришло', description: t`Neuter form (it); the masculine one if missing` },
    ];

    return [
        {
            name: 'userCase',
            options: {
                aliases: [{ alias: 'uc', visible: true }],
                category: CATEGORY,
                unnamedArgs: [caseArg],
                description: t`The user's name in the given Russian case.`,
                returns: t`The declined name, or the name as is if the case is unknown or the forms are not ready.`,
                exampleUsage: ['смотрит на {{uc::вн}}', 'подходит к {{userCase::дт}}', 'говорит о {{uc::пр}}'],
                handler: (c) => caseOf('user', c.unnamedArgs?.[0], deps, c),
            },
        },
        {
            name: 'charCase',
            options: {
                aliases: [{ alias: 'cc', visible: true }],
                category: CATEGORY,
                unnamedArgs: [caseArg],
                description: t`The character's name in the given Russian case. In a group chat, the character that is speaking.`,
                returns: t`The declined name, or the name as is if the case is unknown or the forms are not ready.`,
                exampleUsage: ['подошла к {{cc::дт}}', 'без {{charCase::рд}}', 'вместе с {{cc::тв}}'],
                handler: (c) => caseOf('char', c.unnamedArgs?.[0], deps, c),
            },
        },
        {
            name: 'inflect',
            options: {
                category: CATEGORY,
                unnamedArgs: [
                    { name: 'text', sampleValue: 'Тёмный лес', description: t`A word or a noun phrase in the nominative` },
                    { name: 'case', sampleValue: 'пр2', description: t`Case: им, рд, дт, вн, тв, пр, пр2` },
                    { name: 'number', optional: true, sampleValue: 'мн', description: t`мн for plural` },
                ],
                description: t`Declines any Russian word or noun phrase.`,
                returns: t`The phrase in the given case, or as is if the dictionaries are not loaded.`,
                exampleUsage: ['в {{inflect::Тёмный лес::пр2}}', 'нет {{inflect::старая ведьма::рд}}', 'с {{inflect::дракон::тв::мн}}'],
                handler: (c) => {
                    const [text = '', code, num] = c.unnamedArgs ?? [];
                    const tag = normalizeCase(code);
                    if (!tag) {
                        warn(c, `unknown case "${code}", the nominative is used`);
                        return text;
                    }
                    let number = 'sing';
                    if (num !== undefined && num !== '') {
                        number = normalizeNumber(num) ?? 'sing';
                        if (!normalizeNumber(num)) warn(c, `unknown number "${num}", singular is used`);
                    }
                    const morph = deps.morph();
                    if (!morph) {
                        warn(c, 'dictionaries are not loaded yet, the text is used as is');
                        return text;
                    }
                    const r = inflectPhrase(text, tag, { morph, number });
                    if (!r.ok) warn(c, `could not inflect "${text}"`);
                    return r.text;
                },
            },
        },
        {
            name: 'userGender',
            options: {
                category: CATEGORY,
                description: t`The user's gender set in RuInflect: m, f, n, pl, or empty if not set.`,
                exampleUsage: ['{{if::{{userGender}}==f}}…{{/if}}'],
                handler: (c) => deps.gender('user', roleName(c, 'user', deps)) ?? '',
            },
        },
        {
            name: 'charGender',
            options: {
                category: CATEGORY,
                description: t`The character's gender set in RuInflect: m, f, n, pl, or empty if not set.`,
                exampleUsage: ['{{charGender}}'],
                handler: (c) => deps.gender('char', roleName(c, 'char', deps)) ?? '',
            },
        },
        {
            name: 'ug',
            options: {
                aliases: [{ alias: 'userG', visible: true }],
                category: CATEGORY,
                unnamedArgs: genderArgs,
                description: t`Picks the variant for the user's gender: masculine, feminine, plural, neuter. With one argument the word is converted automatically.`,
                exampleUsage: ['ты {{ug::пришёл::пришла}}', 'ты {{ug::пришёл}}', '{{ug::готов}} идти?'],
                handler: (c) => genderSelect('user', c.unnamedArgs ?? [], deps, c),
            },
        },
        {
            name: 'cg',
            options: {
                aliases: [{ alias: 'charG', visible: true }],
                category: CATEGORY,
                unnamedArgs: genderArgs,
                description: t`Picks the variant for the character's gender: masculine, feminine, plural, neuter. With one argument the word is converted automatically.`,
                exampleUsage: ['{{char}} {{cg::вошёл::вошла}}', '{{char}} {{cg::устал}}'],
                handler: (c) => genderSelect('char', c.unnamedArgs ?? [], deps, c),
            },
        },
    ];
}

export const MACRO_NAMES = ['userCase', 'uc', 'charCase', 'cc', 'inflect', 'userGender', 'charGender', 'ug', 'userG', 'cg', 'charG'];

export function createLegacyMacros(deps) {
    const out = [];
    for (const role of ['user', 'char']) {
        for (const c of ['nomn', 'gent', 'datv', 'accs', 'ablt', 'loct', 'loc2']) {
            out.push({ key: `${role}_${c}`, value: () => caseOf(role, c, deps, null), description: `${role} (${c})` });
        }
        out.push({ key: `${role}_gender`, value: () => deps.gender(role, roleName(null, role, deps)) ?? '', description: `${role} gender` });
    }
    return out;
}
