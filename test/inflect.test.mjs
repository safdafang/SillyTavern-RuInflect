import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflectPhrase } from '../src/inflect.js';
import { getMorph } from './helpers.mjs';

const morph = await getMorph();
const inf = (p, c, number) => inflectPhrase(p, c, { morph, number }).text;

test('noun phrases', () => {
    assert.equal(inf('Тёмный лес', 'loct'), 'Тёмном лесе');
    assert.equal(inf('Тёмный лес', 'loc2'), 'Тёмном лесу');
    assert.equal(inf('тёмный лес', 'gent'), 'тёмного леса');
    assert.equal(inf('старая ведьма', 'accs'), 'старую ведьму');
    assert.equal(inf('чёрный кот', 'accs'), 'чёрного кота');
    assert.equal(inf('чёрный кот', 'datv', 'plur'), 'чёрным котам');
    assert.equal(inf('книга', 'ablt'), 'книгой');
    assert.equal(inf('меч', 'ablt', 'plur'), 'мечами');
});

test('dependents stay frozen', () => {
    assert.equal(inf('Орден Серебряного Клинка', 'datv'), 'Ордену Серебряного Клинка');
    assert.equal(inf('Кот в сапогах', 'ablt'), 'Котом в сапогах');
    assert.equal(inf('Король Артур', 'gent'), 'Короля Артура');
});

test('invented words and latin', () => {
    assert.equal(inf('Морвенна', 'datv'), 'Морвенне');
    assert.equal(inf('Эльдорадо', 'loct'), 'Эльдорадо');
    assert.equal(inf('Excalibur', 'gent'), 'Excalibur');
});

test('without dictionaries the phrase is returned as is', () => {
    assert.deepEqual(inflectPhrase('лес', 'gent', { morph: null }), { text: 'лес', ok: false });
});
