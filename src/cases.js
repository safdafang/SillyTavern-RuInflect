// Case codes: им/рд/дт/вн/тв/пр, род/дат/…, nom/gen/…, OpenCorpora tags.

export const MAIN_CASES = ['nomn', 'gent', 'datv', 'accs', 'ablt', 'loct'];
export const ALL_CASES = [...MAIN_CASES, 'gen2', 'loc2', 'voct'];

export const CASE_FALLBACK = { gen2: 'gent', loc2: 'loct', voct: 'nomn' };

const ALIASES = {
    nomn: ['им', 'и', 'имен', 'именит', 'именительный', 'nom', 'nomn', 'nominative'],
    gent: ['рд', 'р', 'род', 'родит', 'родительный', 'gen', 'gent', 'genitive'],
    datv: ['дт', 'д', 'дат', 'датит', 'дательный', 'dat', 'datv', 'dative'],
    accs: ['вн', 'в', 'вин', 'винит', 'винительный', 'acc', 'accs', 'accusative'],
    ablt: ['тв', 'т', 'твор', 'творит', 'творительный', 'ins', 'inst', 'instr', 'instrumental', 'abl', 'ablt'],
    loct: ['пр', 'п', 'пред', 'предл', 'предлож', 'предложный', 'loc', 'loct', 'prep', 'prepositional', 'locative'],
    loc2: ['пр2', 'п2', 'мест', 'местн', 'местный', 'лок', 'локатив', 'loc2'],
    gen2: ['рд2', 'р2', 'партитив', 'part', 'gen2'],
    voct: ['зв', 'зват', 'звательный', 'voc', 'voct', 'vocative'],
};

const LOOKUP = new Map();
for (const [tag, list] of Object.entries(ALIASES)) {
    for (const a of list) LOOKUP.set(a.replace(/ё/g, 'е'), tag);
}

const clean = (code) => String(code ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[\s.]+/g, '');

export function normalizeCase(code) {
    const c = clean(code);
    if (!c) return null;
    if (LOOKUP.has(c)) return LOOKUP.get(c);
    // «им.п.», «рд.п», «пр.пад.»
    const m = c.match(/^(.+?)(?:п|пад|падеж)$/);
    if (m && LOOKUP.has(m[1])) return LOOKUP.get(m[1]);
    return null;
}

const PLURAL = new Set(['мн', 'множ', 'множественное', 'pl', 'plur', 'plural']);
const SINGULAR = new Set(['ед', 'единств', 'единственное', 'sg', 'sing', 'singular']);

export function normalizeNumber(code) {
    const c = clean(code);
    if (PLURAL.has(c)) return 'plur';
    if (SINGULAR.has(c)) return 'sing';
    return null;
}

export const CASE_LABELS_RU = {
    nomn: 'им.', gent: 'род.', datv: 'дат.', accs: 'вин.', ablt: 'твор.', loct: 'предл.', loc2: 'местн.', gen2: 'род. 2', voct: 'зват.',
};
