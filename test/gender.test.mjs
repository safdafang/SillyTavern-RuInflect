import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVariant, toGender, wordToGender } from '../src/gender.js';
import { getMorph } from './helpers.mjs';

const morph = await getMorph();
const g = (w, gender) => toGender(w, gender, morph).text;

test('past tense verbs', () => {
    assert.equal(g('пришёл', 'f'), 'пришла');
    assert.equal(g('пришёл', 'n'), 'пришло');
    assert.equal(g('пришёл', 'pl'), 'пришли');
    assert.equal(g('пришёл', 'm'), 'пришёл');
    assert.equal(g('пришла', 'm'), 'пришёл');
    assert.equal(g('ушёл', 'f'), 'ушла');
    assert.equal(g('был', 'f'), 'была');
    assert.equal(g('смог', 'f'), 'смогла');
    assert.equal(g('видел', 'pl'), 'видели');
});

test('short and full adjectives, participles', () => {
    assert.equal(g('готов', 'f'), 'готова');
    assert.equal(g('готов', 'pl'), 'готовы');
    assert.equal(g('рад', 'f'), 'рада');
    assert.equal(g('должен', 'f'), 'должна');
    assert.equal(g('уставший', 'f'), 'уставшая');
    assert.equal(g('уставший', 'pl'), 'уставшие');
    assert.equal(g('уставший', 'n'), 'уставшее');
    assert.equal(g('устал', 'f'), 'устала');
    assert.equal(g('сам', 'f'), 'сама');
});

test('spelling and capitalisation are kept', () => {
    assert.equal(g('пришел', 'm'), 'пришел');
    assert.equal(g('пришла', 'm'), 'пришёл');
    assert.equal(g('Пришёл', 'f'), 'Пришла');
    assert.equal(g('ПРИШЁЛ', 'f'), 'ПРИШЛА');
});

test('unknown words are returned as is', () => {
    const r = wordToGender('флымбрил', 'f', morph);
    assert.deepEqual(r, { text: 'флымбрил', ok: false, from: null });
    assert.equal(toGender('стол', 'f', morph).converted, 0);
    assert.equal(toGender('пришёл', 'f', null).text, 'пришёл');
});

test('phrases convert verbs and short forms only', () => {
    assert.equal(g('был рад тебя видеть', 'f'), 'была рада тебя видеть');
    assert.equal(g('сам пришёл домой', 'f'), 'сама пришла домой');
    assert.equal(g('надел новый костюм', 'f'), 'надела новый костюм');
});

test('explicit variants', () => {
    assert.deepEqual(pickVariant(['пришёл', 'пришла'], 'f'), { text: 'пришла', warning: null });
    assert.deepEqual(pickVariant(['пришёл', 'пришла'], 'm'), { text: 'пришёл', warning: null });
    const pl = pickVariant(['пришёл', 'пришла'], 'pl');
    assert.equal(pl.text, 'пришёл');
    assert.ok(pl.warning);
    assert.deepEqual(pickVariant(['пришёл', 'пришла'], 'n'), { text: 'пришёл', warning: null });
    assert.deepEqual(pickVariant(['пришёл', 'пришла', 'пришли', 'пришло'], 'n'), { text: 'пришло', warning: null });
    assert.deepEqual(pickVariant(['пришёл', 'пришла', 'пришли'], 'pl'), { text: 'пришли', warning: null });
    assert.equal(pickVariant(['пришёл', 'пришла'], null).text, 'пришёл');
});
