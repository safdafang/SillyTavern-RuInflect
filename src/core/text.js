// applyCase is copied from RuMorph.
// https://github.com/safdafang/SillyTavern-RuMorph/blob/4a9e69717113680c40cf076bdfb7b9d6fa62353e/src/expand.js

export function applyCase(form, original) {
    if (form.includes('-') && original.includes('-')) {
        const fp = form.split('-');
        const op = original.split('-');
        if (fp.length === op.length) return fp.map((f, i) => applyCase(f, op[i])).join('-');
    }
    if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase()) {
        return form.toUpperCase();
    }
    const first = original.charAt(0);
    if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
        return form.charAt(0).toUpperCase() + form.slice(1);
    }
    return form;
}

// Az writes «ё»; a text written without it keeps it that way.
export function matchYo(form, original, canonical) {
    const omits = !!canonical && canonical.toLowerCase().includes('ё') && !original.toLowerCase().includes('ё');
    return omits ? form.replace(/ё/g, 'е').replace(/Ё/g, 'Е') : form;
}

export const CYRILLIC = /[а-яё]/i;
