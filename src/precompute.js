// Macro handlers are synchronous, so forms are computed in advance. Once Az is
// loaded a missing name is declined on the spot.

import { declineName } from './names.js';

const keyOf = (role, name, spec) => `${role}\u0000${name}\u0000${spec?.gender ?? ''}\u0000${JSON.stringify(spec?.forms ?? {})}`;

export class FormsTable {
    constructor({ getMorph, getSpec, onMiss }) {
        this.getMorph = getMorph;
        this.getSpec = getSpec;
        this.onMiss = onMiss;
        this.entries = new Map();
    }

    get size() {
        return this.entries.size;
    }

    clear() {
        this.entries.clear();
    }

    compute(role, name, spec = this.getSpec(role, name)) {
        const morph = this.getMorph();
        if (!morph) return null;
        const entry = declineName(name, { morph, gender: spec.gender, forms: spec.forms });
        this.entries.set(keyOf(role, name, spec), entry);
        return entry;
    }

    lookup(role, name, specOverride) {
        if (typeof name !== 'string' || !name) return null;
        const spec = specOverride ?? this.getSpec(role, name);
        const hit = this.entries.get(keyOf(role, name, spec));
        if (hit) return hit;
        const entry = this.compute(role, name, spec);
        if (!entry) this.onMiss?.(role, name);
        return entry;
    }

    rebuild(people) {
        if (!this.getMorph()) return 0;
        this.entries.clear();
        let n = 0;
        for (const { role, name } of people) {
            if (typeof name === 'string' && name && this.compute(role, name)) n++;
        }
        return n;
    }
}
