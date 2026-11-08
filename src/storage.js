// Persona: extensionSettings.ruinflect.personas[avatarId]. Character: data.extensions.ruinflect.
// Manual forms apply only to the `name` they were written for.

import { ALL_CASES } from './cases.js';
import { normalizeGender } from './names.js';

export const MODULE = 'ruinflect';
export const CARD_KEY = 'ruinflect';

export function cleanRecord(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const out = {};
    const gender = normalizeGender(rec.gender);
    if (gender) out.gender = gender;
    const forms = {};
    for (const c of ALL_CASES) {
        const v = typeof rec.forms?.[c] === 'string' ? rec.forms[c].trim() : '';
        if (v) forms[c] = v;
    }
    if (Object.keys(forms).length) {
        out.forms = forms;
        if (typeof rec.name === 'string' && rec.name) out.name = rec.name;
    }
    if (rec.backup && typeof rec.backup === 'object') out.backup = rec.backup;
    return Object.keys(out).length ? out : null;
}

export function specFor(rec, name) {
    const gender = normalizeGender(rec?.gender);
    const forms = rec?.forms && (!rec.name || rec.name === name) ? rec.forms : {};
    return { gender, forms };
}

export function getPersonaRecord(settings, avatarId) {
    if (!avatarId) return null;
    return settings?.personas?.[avatarId] ?? null;
}

export function setPersonaRecord(settings, avatarId, rec) {
    if (!avatarId) return null;
    if (!settings.personas || typeof settings.personas !== 'object') settings.personas = {};
    const clean = cleanRecord(rec);
    if (clean) settings.personas[avatarId] = clean;
    else delete settings.personas[avatarId];
    return clean;
}

export function getCardRecord(character) {
    const rec = character?.data?.extensions?.[CARD_KEY];
    return rec && typeof rec === 'object' ? rec : null;
}

export function currentAvatar({ userAvatar, powerUser, chatMetadata, name1 } = {}) {
    const personas = powerUser?.personas ?? {};
    if (userAvatar && userAvatar in personas) return userAvatar;
    const locked = chatMetadata?.persona;
    if (locked && personas[locked] === name1) return locked;
    const def = powerUser?.default_persona;
    if (def && personas[def] === name1) return def;
    const byName = Object.keys(personas).filter((k) => personas[k] === name1);
    return byName.length ? byName[0] : (userAvatar || null);
}

export function toCardPayload(rec) {
    const clean = cleanRecord(rec) ?? {};
    const forms = Object.fromEntries(ALL_CASES.map((c) => [c, clean.forms?.[c] ?? null]));
    return { gender: clean.gender ?? null, name: clean.forms ? clean.name ?? null : null, forms };
}
