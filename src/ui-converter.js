import { CONVERT_FIELDS, TOP_LEVEL_FIELDS, applyToFields, context, readFields, scanCard } from './converter.js';
import { CARD_KEY, getCardRecord } from './storage.js';

const FIELD_LABELS = {
    description: 'description',
    personality: 'personality',
    scenario: 'scenario',
    first_mes: 'first_mes',
    alternate_greetings: 'alternate_greetings',
    mes_example: 'mes_example',
    system_prompt: 'system_prompt',
    post_history_instructions: 'post_history_instructions',
};

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
}

function fieldText(fields, s) {
    return s.field === 'alternate_greetings' ? fields.alternate_greetings[s.index] : fields[s.field];
}

async function writeFields(c, id, values) {
    const ch = c.characters[id];
    const body = { avatar: ch.avatar, data: {} };
    for (const f of CONVERT_FIELDS) {
        body.data[f] = values[f];
        if (TOP_LEVEL_FIELDS.includes(f)) body[f] = values[f];
    }
    const res = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: c.getRequestHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Could not save the card (${res.status})`);
    await c.getOneCharacter(ch.avatar);
    syncEditor(id);
}

// Otherwise the editor would autosave the old text back.
function syncEditor(id) {
    const c = SillyTavern.getContext();
    if (Number(c.characterId) !== Number(id) || c.groupId) return;
    const ch = c.characters[id];
    const set = (sel, v) => {
        const e = document.querySelector(sel);
        if (e) e.value = v ?? '';
    };
    set('#description_textarea', ch.description);
    set('#personality_textarea', ch.personality);
    set('#scenario_pole', ch.scenario);
    set('#firstmessage_textarea', ch.first_mes);
    set('#mes_example_textarea', ch.mes_example);
    set('#system_prompt_textarea', ch.data?.system_prompt);
    set('#post_history_instructions_textarea', ch.data?.post_history_instructions);
}

export async function openConverter({ ctx: c, id, morph, t }) {
    const ch = c.characters[id];
    const suggestions = scanCard(ch, { morph });
    if (!suggestions.length) {
        toastr.info(t`Nothing to convert: no names in an oblique case and no gendered words after «ты».`, 'RuInflect');
        return;
    }
    const fields = readFields(ch);

    const root = el('div', 'ruinflect-convert');
    root.append(el('h3', '', t`Make «${ch.name}» adaptive`));
    root.append(el('small', 'ruinflect-hint', t`Uncertain suggestions are unchecked. The current text is backed up in the card and can be restored.`));
    const tools = el('div', 'ruinflect-row');
    const all = el('a', '', t`Select all`);
    const none = el('a', '', t`Select none`);
    all.href = none.href = '#';
    tools.append(all, el('span', '', '·'), none);
    root.append(tools);

    const boxes = new Map();
    let lastGroup = null;
    for (const s of suggestions) {
        const group = `${s.field}:${s.index ?? ''}`;
        if (group !== lastGroup) {
            lastGroup = group;
            root.append(el('h4', 'ruinflect-diff-field', FIELD_LABELS[s.field] + (s.index !== null ? ` #${s.index + 1}` : '')));
        }
        const row = el('label', 'ruinflect-diff-row');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = s.confidence === 'high';
        boxes.set(s.id, box);
        const { pre, post } = context(fieldText(fields, s), s);
        const line = el('span', 'ruinflect-diff');
        line.append(el('span', '', pre), el('del', '', s.before), el('ins', '', s.after), el('span', '', post));
        row.append(box, line);
        if (s.confidence !== 'high') row.append(el('small', 'ruinflect-diff-low', t`check`));
        root.append(row);
    }
    all.addEventListener('click', (e) => {
        e.preventDefault();
        for (const b of boxes.values()) b.checked = true;
    });
    none.addEventListener('click', (e) => {
        e.preventDefault();
        for (const b of boxes.values()) b.checked = false;
    });

    const popup = new c.Popup(root, c.POPUP_TYPE.CONFIRM, '', {
        okButton: t`Apply`,
        cancelButton: t`Cancel`,
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
    const result = await popup.show();
    if (result !== c.POPUP_RESULT.AFFIRMATIVE) return;
    const chosen = suggestions.filter((s) => boxes.get(s.id)?.checked);
    if (!chosen.length) return;

    const next = applyToFields(fields, chosen);
    const rec = getCardRecord(ch) ?? {};
    await c.writeExtensionField(id, CARD_KEY, { ...rec, backup: { date: new Date().toISOString(), fields } });
    await writeFields(c, id, next);
    toastr.success(t`Applied ${chosen.length} changes. The previous text is backed up.`, 'RuInflect');
}

export async function restoreBackup({ ctx: c, id, t }) {
    const ch = c.characters[id];
    const rec = getCardRecord(ch);
    const backup = rec?.backup;
    if (!backup?.fields) {
        toastr.info(t`This card has no RuInflect backup.`, 'RuInflect');
        return;
    }
    const date = new Date(backup.date).toLocaleString();
    const ok = await c.Popup.show.confirm(t`Restore «${ch.name}»?`, t`The text fields will be restored from the backup made on ${date}.`);
    if (!ok) return;
    await writeFields(c, id, backup.fields);
    await c.writeExtensionField(id, CARD_KEY, { ...getCardRecord(c.characters[id]), backup: null });
    toastr.success(t`Restored.`, 'RuInflect');
}
