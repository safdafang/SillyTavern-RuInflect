import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes, detectGenderErrors } from '../src/detector.js';
import { getMorph, root } from './helpers.mjs';

const morph = await getMorph();
const fixture = fs.readFileSync(path.join(root, 'test/fixtures/gender-detector.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const run = (row) => detectGenderErrors(row.text, {
    morph,
    userGender: row.user,
    userNames: row.name ? [row.name] : [],
    charGender: row.char ?? null,
    firstPerson: !!row.first,
});

test('fixture: at least 150 phrases, half of them traps', () => {
    assert.ok(fixture.length >= 150, `${fixture.length}`);
    assert.ok(fixture.filter((r) => !r.errors.length).length >= fixture.length / 2 - 10);
});

test('precision ≥ 95% on the fixture', () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    const falseAlarms = [];
    for (const row of fixture) {
        const found = run(row).map((i) => i.word);
        const expected = [...row.errors];
        for (const w of found) {
            const k = expected.indexOf(w);
            if (k >= 0) {
                tp++;
                expected.splice(k, 1);
            } else {
                fp++;
                falseAlarms.push(`${row.text} → ${w}`);
            }
        }
        fn += expected.length;
    }
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    console.log(`detector: ${fixture.length} phrases, TP ${tp}, FP ${fp}, FN ${fn}, precision ${(precision * 100).toFixed(1)}%, recall ${(recall * 100).toFixed(1)}%`);
    if (falseAlarms.length) console.log('false alarms:\n  ' + falseAlarms.join('\n  '));
    assert.ok(precision >= 0.95, `precision ${precision}`);
});

test('subject and verb not adjacent', () => {
    const none = (text, user) => assert.deepEqual(detectGenderErrors(text, { morph, userGender: user }), [], text);
    none('Ты знал, что она пришла.', 'm');
    none('Ты и он пришли.', 'f');
    none('Ты, говорят, пришёл.', 'm');
});

test('fixes keep the spelling', () => {
    const text = 'Ты пришёл, а потом ты *опоздал*. Ты устал?';
    const issues = detectGenderErrors(text, { morph, userGender: 'f' });
    assert.deepEqual(issues.map((i) => [i.word, i.fix]), [['пришёл', 'пришла'], ['опоздал', 'опоздала'], ['устал', 'устала']]);
    assert.equal(applyFixes(text, issues), 'Ты пришла, а потом ты *опоздала*. Ты устала?');
    assert.equal(detectGenderErrors('Ты пришел.', { morph, userGender: 'f' })[0].fix, 'пришла');
    assert.equal(detectGenderErrors('Ты пришла.', { morph, userGender: 'm' })[0].fix, 'пришёл');
    assert.equal(detectGenderErrors('Ты пришёл.', { morph, userGender: 'n' })[0].fix, 'пришло');
});

test('nothing without a gender or dictionaries', () => {
    assert.deepEqual(detectGenderErrors('Ты пришёл.', { morph, userGender: null }), []);
    assert.deepEqual(detectGenderErrors('Ты пришёл.', { morph: null, userGender: 'f' }), []);
});
