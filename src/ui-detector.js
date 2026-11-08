import { applyFixes, detectGenderErrors } from './detector.js';

const LOG = '[RuInflect]';
const MARK = 'ruinflect-err';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRegex = (word) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(word)}(?![\\p{L}\\p{N}])`, 'gu');

export function occurrenceIndex(text, word, start) {
    let k = 0;
    for (const m of text.matchAll(wordRegex(word))) {
        if (m.index === start) return k;
        k++;
    }
    return -1;
}

export function replaceOccurrence(text, word, k, replacement) {
    let n = 0;
    return text.replace(wordRegex(word), (m) => (n++ === k ? replacement : m));
}

export function createDetector({ ctx, getSettings, getMorph, getGender, isGroup, t, debug }) {
    let saveTimer = null;
    const saveSoon = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => ctx().saveChat?.().catch?.((e) => console.error(LOG, 'could not save the chat', e)), 500);
    };

    const active = () => {
        const s = getSettings();
        return s.enabled && s.detector.enabled && !!getMorph();
    };

    function issuesFor(mes) {
        if (!mes || mes.is_user || mes.is_system || typeof mes.mes !== 'string') return [];
        const s = getSettings();
        const c = ctx();
        return detectGenderErrors(mes.mes, {
            morph: getMorph(),
            userGender: getGender('user', c.name1),
            userNames: [c.name1],
            charGender: getGender('char', mes.name),
            firstPerson: s.detector.firstPerson && !isGroup(),
        });
    }

    function setText(mes, text) {
        mes.mes = text;
        if (Array.isArray(mes.swipes) && Number.isInteger(mes.swipe_id) && mes.swipes[mes.swipe_id] !== undefined) {
            mes.swipes[mes.swipe_id] = text;
        }
    }

    function clear(el) {
        for (const span of el.querySelectorAll(`span.${MARK}`)) span.replaceWith(document.createTextNode(span.textContent));
        el.normalize();
    }

    function wrap(el, word, k, onClick, title) {
        const re = wordRegex(word);
        let n = 0;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => (node.parentElement?.closest('code, pre, .' + MARK) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (const m of node.data.matchAll(re)) {
                if (n++ !== k) continue;
                const after = node.splitText(m.index);
                after.splitText(m[0].length);
                const span = document.createElement('span');
                span.className = MARK;
                span.title = title;
                span.textContent = after.data;
                span.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick();
                });
                after.replaceWith(span);
                return true;
            }
        }
        return false;
    }

    function highlight(id) {
        const el = document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
        if (!el) return;
        clear(el);
        if (!active() || getSettings().detector.autofix) return;
        const mes = ctx().chat?.[id];
        if (!mes || mes.extra?.display_text) return;
        for (const issue of issuesFor(mes)) {
            const k = occurrenceIndex(mes.mes, issue.word, issue.start);
            if (k < 0) continue;
            wrap(el, issue.word, k, () => fix(id, issue, k), t`Fix to «${issue.fix}»`);
        }
    }

    function fix(id, issue, k) {
        const c = ctx();
        const mes = c.chat?.[id];
        if (!mes) return;
        const next = replaceOccurrence(mes.mes, issue.word, k, issue.fix);
        if (next === mes.mes) return;
        setText(mes, next);
        c.updateMessageBlock(id, mes);
        saveSoon();
        debug(`fixed «${issue.word}» → «${issue.fix}» in message ${id}`);
        highlight(id);
    }

    return {
        onReceived(id) {
            if (!active() || !getSettings().detector.autofix) return;
            const mes = ctx().chat?.[id];
            const issues = issuesFor(mes);
            if (!issues.length) return;
            setText(mes, applyFixes(mes.mes, issues));
            debug(`auto-fixed ${issues.length} gender errors in message ${id}`);
            saveSoon();
        },
        onRendered(id) {
            try {
                highlight(Number(id));
            } catch (e) {
                console.error(LOG, 'detector failed', e);
            }
        },
        rescan() {
            for (const el of document.querySelectorAll('#chat .mes[mesid]')) {
                try {
                    highlight(Number(el.getAttribute('mesid')));
                } catch (e) {
                    debug('detector failed', e);
                }
            }
        },
    };
}
