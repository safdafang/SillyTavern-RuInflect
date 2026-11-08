import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declineName, guessForms, normalizeGender } from '../src/names.js';
import { MAIN_CASES, normalizeCase, normalizeNumber } from '../src/cases.js';
import { getMorph } from './helpers.mjs';

const morph = await getMorph();
const six = (name, gender) => {
    const { forms } = declineName(name, { morph, gender });
    return MAIN_CASES.map((c) => forms[c]).join(' / ');
};

// им. / рд. / дт. / вн. / тв. / пр.
const TABLE = [
    ['Анна', 'f', 'Анна / Анны / Анне / Анну / Анной / Анне'],
    ['Иван', 'm', 'Иван / Ивана / Ивану / Ивана / Иваном / Иване'],
    ['Никита', 'm', 'Никита / Никиты / Никите / Никиту / Никитой / Никите'],
    ['Мария', 'f', 'Мария / Марии / Марии / Марию / Марией / Марии'],
    ['Игорь', 'm', 'Игорь / Игоря / Игорю / Игоря / Игорем / Игоре'],
    ['Любовь', 'f', 'Любовь / Любови / Любови / Любовь / Любовью / Любови'],
    ['Элдрин', 'm', 'Элдрин / Элдрина / Элдрину / Элдрина / Элдрином / Элдрине'],
    ['Эстер', 'f', 'Эстер / Эстер / Эстер / Эстер / Эстер / Эстер'],
    ['Морвенна', 'f', 'Морвенна / Морвенны / Морвенне / Морвенну / Морвенной / Морвенне'],
    ['Шарль', 'm', 'Шарль / Шарля / Шарлю / Шарля / Шарлем / Шарле'],
    ['Кира Морвенна', 'f', 'Кира Морвенна / Киры Морвенны / Кире Морвенне / Киру Морвенну / Кирой Морвенной / Кире Морвенне'],
    ['Леди Элейн', 'f', 'Леди Элейн / Леди Элейн / Леди Элейн / Леди Элейн / Леди Элейн / Леди Элейн'],
    ['Alice', null, 'Alice / Alice / Alice / Alice / Alice / Alice'],
];

for (const [name, gender, expected] of TABLE) {
    test(`${name} (${gender ?? '—'})`, () => assert.equal(six(name, gender), expected));
}

for (const name of ['Хьюго', 'Мими', 'Тедди']) {
    for (const gender of ['m', 'f', 'n', 'pl', null]) {
        test(`${name} is indeclinable for ${gender ?? 'no gender'}`, () => {
            assert.equal(six(name, gender), Array(6).fill(name).join(' / '));
        });
    }
}

test('Никита declines in the 1st declension with a masculine gender', () => {
    assert.equal(declineName('Никита', { morph, gender: 'm' }).forms.gent, 'Никиты');
});

test('a feminine name ending in a consonant does not decline', () => {
    assert.equal(six('Иван', 'f'), Array(6).fill('Иван').join(' / '));
    assert.equal(six('Элдрин', 'f'), Array(6).fill('Элдрин').join(' / '));
});

test('invented masculine names: -й, -ий, -ь, hushing', () => {
    assert.equal(six('Тарвей', 'm'), 'Тарвей / Тарвея / Тарвею / Тарвея / Тарвеем / Тарвее');
    assert.equal(six('Арий', 'm'), 'Арий / Ария / Арию / Ария / Арием / Арии');
    assert.equal(six('Каэль', 'm'), 'Каэль / Каэля / Каэлю / Каэля / Каэлем / Каэле');
    assert.equal(six('Коваш', 'm'), 'Коваш / Коваша / Ковашу / Коваша / Ковашем / Коваше');
});

test('invented feminine names: -ия, -я, -ь', () => {
    assert.equal(six('Мирия', 'f'), 'Мирия / Мирии / Мирии / Мирию / Мирией / Мирии');
    assert.equal(six('Лея', 'f'), 'Лея / Леи / Лее / Лею / Леей / Лее');
    assert.equal(six('Каэль', 'f'), 'Каэль / Каэли / Каэли / Каэль / Каэлью / Каэли');
});

test('-а declines for any gender', () => {
    assert.equal(six('Морвенна', 'm'), 'Морвенна / Морвенны / Морвенне / Морвенну / Морвенной / Морвенне');
    assert.equal(declineName('Тарша', { morph, gender: 'f' }).forms.ablt, 'Таршей');
});

test('vowel endings other than -а/-я are indeclinable', () => {
    for (const n of ['Эльдорадо', 'Кали', 'Шиту', 'Рене']) assert.equal(six(n, 'f'), Array(6).fill(n).join(' / '));
});

test('a masculine inanimate noun as a name gets an animate accusative', () => {
    assert.equal(declineName('Шторм', { morph, gender: 'm' }).forms.accs, 'Шторма');
});

test('titles and adjectives agree with the person', () => {
    assert.equal(declineName('Лорд Элдрин', { morph, gender: 'm' }).forms.gent, 'Лорда Элдрина');
    assert.equal(declineName('Лорд Элдрин', { morph, gender: 'm' }).forms.ablt, 'Лордом Элдрином');
    assert.equal(declineName('Госпожа Анна', { morph, gender: 'f' }).forms.datv, 'Госпоже Анне');
    assert.equal(declineName('Тёмный Элдрин', { morph, gender: 'm' }).forms.ablt, 'Тёмным Элдрином');
    assert.equal(declineName('Тёмная Морвенна', { morph, gender: 'f' }).forms.accs, 'Тёмную Морвенну');
    assert.equal(declineName('Серый Волк', { morph, gender: 'm' }).forms.accs, 'Серого Волка');
});

test('surnames after a first name', () => {
    assert.equal(declineName('Кай Таров', { morph, gender: 'm' }).forms.ablt, 'Каем Таровым');
    assert.equal(declineName('Кира Тарова', { morph, gender: 'f' }).forms.gent, 'Киры Таровой');
    assert.equal(declineName('Иван Петров', { morph, gender: 'm' }).forms.ablt, 'Иваном Петровым');
});

test('hyphenated names decline each part', () => {
    assert.equal(declineName('Анна-Мария', { morph, gender: 'f' }).forms.gent, 'Анны-Марии');
});

test('capitalisation of the source is kept', () => {
    assert.equal(declineName('АННА', { morph, gender: 'f' }).forms.datv, 'АННЕ');
    assert.equal(declineName('анна', { morph, gender: 'f' }).forms.datv, 'анне');
});

test('manual forms win', () => {
    const e = declineName('Элдрин', { morph, gender: 'm', forms: { datv: 'Элдрину-сама', gent: '  ' } });
    assert.equal(e.forms.datv, 'Элдрину-сама');
    assert.equal(e.forms.gent, 'Элдрина');
    assert.equal(e.sources.datv, 'manual');
    assert.equal(e.source, 'manual');
});

test('gender is inferred and flagged as uncertain when not given', () => {
    const anna = declineName('Анна', { morph });
    assert.equal(anna.gender, 'f');
    assert.equal(anna.uncertain, false);
    const eld = declineName('Элдрин', { morph });
    assert.equal(eld.gender, 'm');
    assert.equal(eld.uncertain, true);
    assert.equal(eld.forms.datv, 'Элдрину');
    const sasha = declineName('Саша', { morph });
    assert.equal(sasha.uncertain, true);
    assert.equal(declineName('Кира Морвенна', { morph }).gender, 'f');
});

test('sources: dictionary, guess, latin', () => {
    assert.equal(declineName('Анна', { morph, gender: 'f' }).source, 'dictionary');
    assert.equal(declineName('Элдрин', { morph, gender: 'm' }).source, 'guess');
    assert.equal(declineName('Alice', { morph }).source, 'latin');
});

test('without dictionaries only the nominative is known', () => {
    const e = declineName('Анна', { morph: null, gender: 'f' });
    assert.equal(e.source, 'pending');
    assert.equal(e.forms.datv, 'Анна');
});

test('loc2 and voct fall back to loct and nomn', () => {
    const e = declineName('Анна', { morph, gender: 'f' });
    assert.equal(e.forms.loc2, 'Анне');
    assert.equal(e.forms.voct, 'Анна');
});

test('guessForms picks one paradigm', () => {
    assert.equal(guessForms('элдрин', 'm').type, 'masc-hard');
    assert.equal(guessForms('элдрин', 'f').type, 'indeclinable');
    assert.equal(guessForms('морвенна', 'm').type, '1st-a');
});

test('case codes', () => {
    const cases = {
        nomn: ['им', 'И.п.', 'nom', 'NOMN', 'именительный'],
        gent: ['рд', 'род', 'Р.П.', 'gen', 'gent', 'родительный'],
        datv: ['дт', 'дат', 'Д', 'dat', 'datv'],
        accs: ['вн', 'вин', 'в.п.', 'acc', 'accs'],
        ablt: ['тв', 'твор', 'ins', 'instr', 'ablt'],
        loct: ['пр', 'пред', 'предл', 'loc', 'prep', 'loct', 'пр.п.'],
        loc2: ['пр2', 'мест', 'loc2'],
        voct: ['зв', 'voc'],
    };
    for (const [tag, codes] of Object.entries(cases)) for (const c of codes) assert.equal(normalizeCase(c), tag, c);
    for (const bad of ['', 'xx', 'падеж', 'мн']) assert.equal(normalizeCase(bad), null, bad);
    assert.equal(normalizeNumber('мн'), 'plur');
    assert.equal(normalizeNumber('pl'), 'plur');
    assert.equal(normalizeNumber('ед'), 'sing');
});

test('gender codes', () => {
    assert.equal(normalizeGender('м'), 'm');
    assert.equal(normalizeGender('Ж'), 'f');
    assert.equal(normalizeGender('ср'), 'n');
    assert.equal(normalizeGender('мн'), 'pl');
    assert.equal(normalizeGender('they'), 'pl');
    assert.equal(normalizeGender(''), null);
});
