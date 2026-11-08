import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToFields, applyToText, readFields, scanCard, scanText } from '../src/converter.js';
import { getMorph } from './helpers.mjs';

const morph = await getMorph();
const conv = (text, { all = false } = {}) => {
    const s = scanText(text, { morph }).filter((x) => all || x.confidence === 'high');
    return applyToText(text, s);
};

test('prepositions', () => {
    assert.equal(conv('Он подходит к {{user}} и садится рядом с {{user}}.'), 'Он подходит к {{uc::дт}} и садится рядом с {{uc::тв}}.');
    assert.equal(conv('У {{user}} нет выбора. Он думает о {{char}}.'), 'У {{uc::рд}} нет выбора. Он думает о {{cc::пр}}.');
    assert.equal(conv('Это подарок для {{user}} от {{char}}.'), 'Это подарок для {{uc::рд}} от {{cc::рд}}.');
    assert.equal(conv('Он смотрит на {{user}}.'), 'Он смотрит на {{user}}.');
    assert.equal(conv('Он смотрит на {{user}}.', { all: true }), 'Он смотрит на {{uc::вн}}.');
});

test('verbs', () => {
    assert.equal(conv('{{char}} видит {{user}} и помогает {{user}}.'), '{{char}} видит {{uc::вн}} и помогает {{uc::дт}}.');
    // Inversion after direct speech: the name is the subject.
    assert.equal(conv('— Привет, — улыбается {{char}}.'), '— Привет, — улыбается {{char}}.');
    assert.equal(conv('— Привет, — говорит {{user}}.'), '— Привет, — говорит {{user}}.');
});

test('glued endings', () => {
    assert.equal(conv('Он дал {{user}}у меч.', { all: true }), 'Он дал {{uc::дт}} меч.');
    assert.equal(conv('Он пошёл с {{user}}ом.'), 'Он пошёл с {{uc::тв}}.');
    assert.equal(conv('Подарок для {{char}}а.'), 'Подарок для {{cc::рд}}.');
});

test('the nominative is left alone', () => {
    assert.equal(conv('{{user}} входит в таверну. {{char}} встаёт.'), '{{user}} входит в таверну. {{char}} встаёт.');
});

test('gendered words after «ты» and {{user}}', () => {
    assert.equal(conv('— Ты пришёл! Ты не устал?'), '— Ты {{ug::пришёл}}! Ты не {{ug::устал}}?');
    assert.equal(conv('{{user}} кивнул.'), '{{user}} {{ug::кивнул}}.');
    assert.equal(conv('Ты пришла.'), 'Ты {{ug::пришёл}}.');
    assert.equal(conv('Ты знаешь его.'), 'Ты знаешь его.');
    assert.equal(conv('Тыква лежала.'), 'Тыква лежала.');
});

test('existing macros are not touched', () => {
    assert.equal(conv('к {{uc::дт}}, ты {{ug::пришёл}}'), 'к {{uc::дт}}, ты {{ug::пришёл}}');
});

test('a whole card', () => {
    const card = {
        name: 'Элдрин',
        description: 'Элдрин заботится о {{user}}.',
        first_mes: '{{char}} подходит к {{user}}. — Ты пришёл!',
        creator_notes: 'к {{user}}',
        data: {
            description: 'Элдрин заботится о {{user}}.',
            first_mes: '{{char}} подходит к {{user}}. — Ты пришёл!',
            alternate_greetings: ['Без {{user}} скучно.', 'Привет.'],
            creator_notes: 'к {{user}}',
        },
    };
    const found = scanCard(card, { morph });
    assert.deepEqual(found.map((s) => [s.field, s.index, s.after]), [
        ['description', null, '{{uc::пр}}'],
        ['first_mes', null, '{{uc::дт}}'],
        ['first_mes', null, '{{ug::пришёл}}'],
        ['alternate_greetings', 0, '{{uc::рд}}'],
    ]);
    const next = applyToFields(readFields(card), found.filter((s) => s.after !== '{{ug::пришёл}}'));
    assert.equal(next.first_mes, '{{char}} подходит к {{uc::дт}}. — Ты пришёл!');
    assert.deepEqual(next.alternate_greetings, ['Без {{uc::рд}} скучно.', 'Привет.']);
    assert.equal(next.description, 'Элдрин заботится о {{uc::пр}}.');
    assert.ok(!('creator_notes' in next));
});
