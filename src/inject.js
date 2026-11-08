// {{user}} and {{char}} are substituted by ST, {who}, {rod} and {examples} here.

export const PROMPT_KEY = 'ruinflect_gender';

export const DEFAULT_USER_TEMPLATE = '{{user}} — {who}. Обращайся к {{user}} {rod}: {examples}.';
export const DEFAULT_CHAT_TEMPLATE = '{{char}} — {who}, о себе говорит {rod}: {examples}.';
export const DEFAULT_WRAPPER = '[{text}]';

const WORDS = {
    user: {
        m: { who: 'мужчина', rod: 'в мужском роде', examples: '«ты пришёл», «ты устал»' },
        f: { who: 'женщина', rod: 'в женском роде', examples: '«ты пришла», «ты устала»' },
        n: { who: 'существо среднего рода', rod: 'в среднем роде', examples: '«ты пришло», «ты устало»' },
        pl: { who: 'несколько персонажей', rod: 'во множественном числе', examples: '«вы пришли», «вы устали»' },
    },
    char: {
        m: { who: 'мужчина', rod: 'в мужском роде', examples: '«я пришёл», «я устал»' },
        f: { who: 'женщина', rod: 'в женском роде', examples: '«я пришла», «я устала»' },
        n: { who: 'существо среднего рода', rod: 'в среднем роде', examples: '«я пришло», «я устало»' },
        pl: { who: 'несколько персонажей', rod: 'во множественном числе', examples: '«мы пришли», «мы устали»' },
    },
};

const fill = (template, words) => String(template ?? '').replace(/\{(who|rod|examples)\}/g, (_, k) => words[k]);

export function buildHint({ userGender, charGender, userTemplate = DEFAULT_USER_TEMPLATE, charTemplate = DEFAULT_CHAT_TEMPLATE, wrapper = DEFAULT_WRAPPER }) {
    const parts = [];
    if (WORDS.user[userGender] && String(userTemplate).trim()) parts.push(fill(userTemplate, WORDS.user[userGender]));
    if (WORDS.char[charGender] && String(charTemplate).trim()) parts.push(fill(charTemplate, WORDS.char[charGender]));
    if (!parts.length) return '';
    const text = parts.join(' ');
    return String(wrapper || '{text}').includes('{text}') ? String(wrapper).replace('{text}', text) : `${wrapper}${text}`;
}
