# Changelog

## 0.2.0 (2026-11-08)

* Gender error detector: likely errors in model replies («ты пришёл» to a female player, «Анна пришёл», optionally
  «я» against the character) get a dashed underline and are fixed on click; optional automatic fixing.
  177 hand-labelled phrases: precision 100%, recall 73%.
* Card converter: suggests `{{uc::…}}`/`{{cc::…}}` after prepositions and verbs and for glued endings, and
  `{{ug::…}}` for gendered words after «ты» and `{{user}}`; diff with checkboxes, backup and restore.

## 0.1.0 (2026-11-08)

First release.

* `{{userCase::case}}` / `{{uc}}` and `{{charCase::case}}` / `{{cc}}`: the user and character names in a
  Russian case. Case codes in Russian, English and OpenCorpora notation.
* One declension per name: dictionary names first, then one paradigm picked by gender and ending; animate
  accusative, compound names, titles, adjectives, surnames, hyphenated names, kept capitalisation.
* `{{inflect::phrase::case[::мн]}}` for any word or noun phrase.
* Gender for the persona (extension settings) and the character (stored in the card):
  `{{ug}}` / `{{userG}}`, `{{cg}}` / `{{charG}}` with explicit variants or automatic conversion,
  `{{userGender}}`, `{{charGender}}`.
* Manual forms for every case.
* Precomputed forms for synchronous macro handlers; the greeting of an untouched chat is rebuilt when the
  dictionaries finish loading or the gender changes.
* Hint for the model about the user's and the character's gender, with configurable position and text.
* Flat fallbacks (`{{user_datv}}`, …) for the legacy macro engine.
* One Az.js instance shared with RuMorph through `globalThis.__ruMorphCore`.
* Settings panel in RuMorph's style with persona and character blocks, preview with a player gender switch,
  macro reference, `/inflect` and `/ruinflect-gender`, Russian translation.
