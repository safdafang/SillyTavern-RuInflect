<p align="center">
  <a href="https://github.com/safdafang/SillyTavern-RuInflect/actions/workflows/test.yml"><img src="https://github.com/safdafang/SillyTavern-RuInflect/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/SillyTavern/SillyTavern"><img src="https://img.shields.io/badge/SillyTavern-1.16.0%2B-a11b1b" alt="SillyTavern 1.16.0+"></a>
  <a href="#licence"><img src="https://img.shields.io/badge/licence-AGPL--3.0-blue" alt="Licence: AGPL-3.0"></a>
  <a href="README.ru.md"><img src="https://img.shields.io/badge/README-по--русски-e18a24" alt="README по-русски"></a>
</p>

# RuInflect

A [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension that puts `{{user}}` and
`{{char}}` into Russian grammatical cases and picks words in the right gender. «смотрит на {{uc::вн}}»
becomes «смотрит на Анну», and «ты {{ug::пришёл}}» becomes «ты пришла» when the player's persona is
female. One card reads correctly for players of any gender. Everything runs in the browser, no server
plugin required.

> [!NOTE]
> RuInflect is a community extension and is not affiliated with the SillyTavern team.

## Why

SillyTavern substitutes `{{user}}` and `{{char}}` in the nominative case only, and a persona has no
gender. Russian card authors avoid names in other cases («смотрит на тебя») or write cards in English.
It hurts most in `first_mes`, which the player sees verbatim.

| In the card | SillyTavern | RuInflect (Анна, f) | RuInflect (Иван, m) |
|---|---|---|---|
| `смотрит на {{user}}` | смотрит на Анна | — | — |
| `смотрит на {{uc::вн}}` | — | смотрит на Анну | смотрит на Ивана |
| `подходит к {{cc::дт}}` (Элдрин) | — | подходит к Элдрину | подходит к Элдрину |
| `Ты {{ug::пришёл}}!` | — | Ты пришла! | Ты пришёл! |
| `{{user}} {{ug::устал::устала}}` | — | Анна устала | Иван устал |

## Features

* **Declined names.** Dictionary names from [OpenCorpora](http://opencorpora.org/) through
  [Az.js](https://github.com/deNULL/Az.js); invented names get one paradigm chosen by gender and ending:
  «Элдрин → Элдрина», «Морвенна → Морвенне», a woman's «Эстер» stays indeclinable. People are animate,
  so the masculine accusative equals the genitive («вижу Элдрина»).
* **Compound names.** «Кира Морвенна → Киры Морвенны», «Лорд Элдрин → Лорда Элдрина», «Тёмная Морвенна →
  Тёмную Морвенну», surnames in -ов/-ин, hyphenated names. Capitalisation is kept.
* **Gender.** A gender field for the persona and the character: m, f, n (it), pl (they). Explicit variants
  `{{ug::пришёл::пришла}}` or automatic conversion `{{ug::пришёл}}` → «пришла/пришло/пришли».
* **Any word.** `{{inflect::Тёмный лес::пр2}}` → «Тёмном лесу».
* **Hint for the model.** A short instruction about the user's and the character's gender in the prompt.
* **Manual forms.** Any case can be corrected by hand. A character's forms are stored in the card and are
  exported with it.
* **Preview.** Text with macros and the result, including «as for a male/female player».
* **Gender error detector.** Underlines «ты пришёл» in a model reply when the player is female; a click fixes it.
* **Card converter.** Finds `{{user}}` in oblique cases and gendered words and suggests macros, with a diff,
  checkboxes and a backup.

## Installation

Requires SillyTavern 1.16.0 or later with the new macro engine enabled (the default since 1.17.0).

1. Open **Extensions** and choose **Install extension**.
2. Paste `https://github.com/safdafang/SillyTavern-RuInflect` and install.
3. Settings appear under **Extensions → RuInflect**. The dictionaries (about 11 MB) load in the background.

With [RuMorph](https://github.com/safdafang/SillyTavern-RuMorph) installed as well, the dictionaries are loaded
once for both extensions (see [The Ru extension set](#the-ru-extension-set)).

## Macro cheat sheet

| Macro | What it does | Example → result |
|---|---|---|
| `{{userCase::case}}`, `{{uc::case}}` | user name in a case | `смотрит на {{uc::вн}}` → смотрит на Анну |
| `{{charCase::case}}`, `{{cc::case}}` | character name in a case | `подошла к {{cc::дт}}` → подошла к Элдрину |
| `{{inflect::phrase::case}}` | any word or noun phrase | `в {{inflect::Тёмный лес::пр2}}` → в Тёмном лесу |
| `{{inflect::phrase::case::мн}}` | the same in plural | `с {{inflect::дракон::тв::мн}}` → с драконами |
| `{{ug::m::f}}`, `{{ug::m::f::pl::n}}` | variant for the user's gender | `ты {{ug::пришёл::пришла}}` |
| `{{ug::word}}` | the word in the user's gender | `ты {{ug::устал}}` → ты устала |
| `{{cg::…}}`, `{{charG::…}}` | the same for the character | `{{char}} {{cg::вошёл::вошла}}` |
| `{{userGender}}`, `{{charGender}}` | gender code: `m`, `f`, `n`, `pl` or empty | `{{if::{{userGender}}==f}}…{{/if}}` |

Aliases: `uc` = `userCase`, `cc` = `charCase`, `ug` = `userG`, `cg` = `charG`.

**Cases** can be written in many ways; case and dots do not matter:

| Case | Codes |
|---|---|
| nominative | `им`, `и`, `nom`, `nomn` |
| genitive | `рд`, `р`, `род`, `gen`, `gent` |
| dative | `дт`, `д`, `дат`, `dat`, `datv` |
| accusative | `вн`, `в`, `вин`, `acc`, `accs` |
| instrumental | `тв`, `т`, `твор`, `ins`, `instr`, `ablt` |
| prepositional | `пр`, `п`, `пред`, `loc`, `prep`, `loct` |
| locative («в лесу») | `пр2`, `мест`, `loc2` |
| vocative | `зв`, `voc`, `voct` |

`пр` gives «о лесе», `пр2` gives «в лесу». Names have no second prepositional, so for them `пр2` = `пр`.
An unknown code leaves the nominative and logs a warning to the console.

**Gender variants.** `{{ug}}` takes m, f, pl, n in this order. A missing plural uses the masculine variant
and logs a warning; a missing neuter uses the masculine variant. With one argument the word is converted
automatically: past tense verbs, short and full adjectives and participles («пришёл → пришла / пришло /
пришли», «готов → готова», «уставший → уставшая»). Words that are not in the dictionary stay as they are.
Without a gender, `{{ug::пришёл::пришла}}` gives the masculine variant and `{{ug::пришёл}}` keeps the word.

Copy-paste examples:

```text
{{char}} подходит к {{uc::дт}} и внимательно смотрит на {{uc::вн}}.
— Ты всё-таки {{ug::пришёл}}! Я {{cg::ждал::ждала}} тебя с самого утра.
{{char}} думает о {{uc::пр}} и о {{inflect::Тёмный лес::пр}}.
— Ты {{ug::готов::готова}}? — спрашивает {{char}}, глядя на {{uc::вн}}.
```

## A card for players of any gender

1. Wherever a name is not in the nominative, use `{{uc::case}}` and `{{cc::case}}`: «к {{uc::дт}}»,
   «у {{uc::рд}}», «с {{uc::тв}}», «о {{uc::пр}}», «видит {{uc::вн}}».
2. Wrap words that depend on the player's gender in `{{ug::…}}`: «ты {{ug::пришёл}}», «{{user}}
   {{ug::устал}}», «ты {{ug::готов::готова}}».
3. Set your character's gender in the **Character** block: it is saved into the card
   (`data.extensions.ruinflect`) and exported with it.
4. Check the result in the **Preview** with the «as for a player who is» switch.

## Setting the gender and name forms

* **Persona.** The persona panel gets a «Gender for RuInflect» select; the full block with the case table
  is in the extension settings. The data is kept in `extensionSettings.ruinflect.personas[avatar]` and
  SillyTavern's own persona data is not touched.
* **Character.** The **Character** block in the extension settings; a group chat adds a member select.
* **Manual forms.** Any form in the table can be overwritten; an empty field means the automatic form. The
  label shows where a form comes from: dictionary, guessed or manual. Manual forms are tied to the name:
  after a rename they no longer apply, the gender does.
* **No gender.** The gender is guessed from the name and marked as such; set it for invented names.
* Slash command: `/ruinflect-gender user f`, `/ruinflect-gender char m`; without arguments it returns the
  user's current gender.

## Hint for the model

Models often get the user's gender, and even their own, wrong. When a gender is set, RuInflect adds a short
hint to the prompt (by default in chat at depth 1, system role):

```text
[{{user}} — женщина. Обращайся к {{user}} в женском роде: «ты пришла», «ты устала». {{char}} — мужчина, о себе говорит в мужском роде: «я пришёл», «я устал».]
```

Position, depth, role and text are configurable. `{who}`, `{rod}` and `{examples}` in the templates are
filled from the gender; `{{user}}` and `{{char}}` are substituted by SillyTavern. In a group chat the hint
follows the character that is about to reply. Nothing is added when no gender is set.

## Slash commands

```text
/inflect Тёмный лес пр2           → Тёмном лесу
/inflect case=дт number=мн дракон → драконам
/ruinflect-gender user f
/ruinflect-gender char
```

## Gender error detector

Models often call a female player «ты пришёл». RuInflect checks every model reply and puts a dashed underline
under likely errors; the tooltip says «Fix to „пришла“» and a click replaces the word in the message and saves
the chat. It checks:

* «ты» + (at most one particle or adverb) + a past tense verb or a short form in the singular whose gender
  differs from the user's: «ты пришёл», «ты не знал», «ты наконец проснулся»;
* the user's name at the start of a sentence + the same: «Анна пришёл»;
* optionally «я» + the same, against the character's gender. Who is speaking is often unclear (a character may
  quote someone), so this is off by default and works only in one-on-one chats.

The detector is conservative: a noun, a pronoun, a comma or a conjunction between the subject and the verb
skips the phrase («ты знал, что она пришла», «ты и он пришли», «ты, говорят, пришёл»). Homonyms are skipped
too: «прав», «рад», «замер» can be nouns. «Fix them automatically» (off by default) corrects a reply before it
is shown. Without a click or that setting messages are never changed.

**Accuracy** on [`test/fixtures/gender-detector.jsonl`](test/fixtures/gender-detector.jsonl): 177 hand-labelled
phrases, 83 with errors and 94 traps without. 66 of 90 errors found, no false alarms: **precision 100%,
recall 73%**. Misses are mostly homonyms («ты прав», «ты готов»), a second verb after «и» («вздохнул и сел»)
and words between «ты» and the verb («ты меня ждал»).

## Card converter

**Make the card adaptive** (in the extension settings and the <kbd>文A</kbd> button in the character panel)
scans `description`, `personality`, `scenario`, `first_mes`, `alternate_greetings`, `mes_example`,
`system_prompt` and `post_history_instructions` (never `name` or `creator_notes`) for:

* `{{user}}` and `{{char}}` after prepositions: «к {{user}}» → `к {{uc::дт}}`, «у {{user}}» → `у {{uc::рд}}`,
  «с {{user}}» → `с {{uc::тв}}`, «о {{user}}» → `о {{uc::пр}}`;
* after verbs that take a person object: «видит {{user}}» → `видит {{uc::вн}}`, «помогает {{user}}» →
  `помогает {{uc::дт}}`. Verbs of speech and the inversion after a line of dialogue («— Привет, — улыбается
  {{char}}») are skipped: the name is in the nominative there;
* endings glued to the macro: «{{user}}у», «с {{char}}ом»;
* gendered verbs and short forms after «ты» and `{{user}}`: «ты пришёл» → `ты {{ug::пришёл}}`.

The changes are listed with context and a checkbox each. Ambiguous ones («на {{user}}», «в {{user}}»,
«за {{user}}» may need different cases) start unchecked. Before saving, the current fields are copied to
`data.extensions.ruinflect.backup`, and **Restore** brings them back.

## For card authors

Players without RuInflect see `{{uc::дт}}` as plain text. So:

* say in `creator_notes` that the card needs RuInflect and link
  `https://github.com/safdafang/SillyTavern-RuInflect`;
* set the character's gender in the **Character** block so that it travels with the card;
* there is no need for the macros in `name` and `creator_notes`.

## Limitations

* **Synchronous macros.** SillyTavern's macro handlers are synchronous while the dictionaries load
  asynchronously. The forms of the user and of every character in the chat are computed in advance when
  the chat, persona, group or card changes. Until the dictionaries are loaded the macros print the
  nominative and log a warning; afterwards the greeting of an untouched chat is rebuilt, the way
  SillyTavern does it on a persona change.
* **Legacy macro engine.** With «Experimental macro engine» turned off in User Settings, macros with
  arguments are unavailable. RuInflect then shows a warning and registers flat macros `{{user_gent}}`,
  `{{user_datv}}`, `{{user_accs}}`, `{{user_ablt}}`, `{{user_loct}}`, `{{user_loc2}}`, `{{user_gender}}` and
  the same `{{char_*}}`. Reload the page after switching the engine.
* **Invented names are guessed.** Without a dictionary entry the stress and origin of a name are unknown:
  a woman's «Элдрин» does not decline, a man's does; «Каэль» without a gender is treated as masculine. Set
  the gender or fix a form by hand.
* **Automatic gender** works for dictionary words only. In a phrase of several words only verbs, short
  forms and «сам» change; full adjectives stay («надел новый костюм»).
* **The detector is conservative.** It catches about three quarters of the errors in simple constructions and
  stays silent when unsure. It takes a character's «ты» to another NPC for the player.
* **The converter suggests, it does not decide.** The case after «на», «в», «за» and after transitive verbs
  depends on the meaning, so check those.
* **A disabled extension** unregisters its macros: `{{uc::дт}}` stays as text, the hint and the detector are
  off, nothing else in SillyTavern changes.

## Compatibility

Tested with SillyTavern 1.19.0 (staging, commit
[`ad29cbd`](https://github.com/SillyTavern/SillyTavern/tree/ad29cbda62e92f145e44d7a10398a38af22ca986)).
Macros with arguments and `getContext().macros` appeared in 1.15.0 and `warn` in the macro context in 1.16.0,
hence the minimum version 1.16.0. The current persona is not in `getContext()`; RuInflect reads it from
`personas.js` and falls back to looking the persona up by name.

## The Ru extension set

* [RuMorph](https://github.com/safdafang/SillyTavern-RuMorph): Russian word forms for lorebook keys, so
  the key `Морвенна` fires on «подошёл к Морвенне».
* **RuInflect**: cases and gender for `{{user}}` and `{{char}}`.

Both use the same Az.js and dictionaries. The Az instance lives in `globalThis.__ruMorphCore`: whoever starts
first loads it, the other waits for the same promise.

## Development

```console
npm test                       # node:test, no dependencies to install
node scripts/i18n-check.mjs
npm install && npm run vendor  # refresh vendor/az and dicts from the az package
node test/browser/run.mjs      # browser harness, needs playwright-core and Chromium
ST_URL=http://127.0.0.1:8000 node test/browser/st.e2e.mjs   # e2e on a running SillyTavern
```

`src/core/` is copied from RuMorph (the source file and commit are in each file's header). The logic lives
in pure functions under `src/` and is tested in Node, without a browser, on the same dictionaries users get.

**Why the dictionaries are in the repository.** SillyTavern installs extensions with `git clone`, with no
build step and no `npm install`, so Az.js and the dictionaries must be in the repository, as in RuMorph.
RuInflect works without RuMorph and needs its own copy; when both are installed only one is loaded. CI checks
that the files match `az@0.2.3` from npm.

## Licence

RuInflect is licensed under the [GNU AGPL 3.0](LICENSE).

Bundled third-party components:

* [Az.js](https://github.com/deNULL/Az.js) 0.2.3, MIT licence, see [vendor/az/LICENSE](vendor/az/LICENSE).
* OpenCorpora dictionaries as packaged by [pymorphy2-dicts](https://github.com/kmike/pymorphy2-dicts),
  CC BY-SA 3.0, see [dicts/LICENSE](dicts/LICENSE). Distributed unmodified.
* `src/core/` is code from [RuMorph](https://github.com/safdafang/SillyTavern-RuMorph), AGPL-3.0.
