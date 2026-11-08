# TODO

* Extract `src/core/` into a shared `ru-morph-core` package used by RuMorph and RuInflect. ST installs
  extensions without `npm install`, so it has to be a vendored copy produced by a script, with CI checking that
  the copy matches the tagged version.
* A banner like RuMorph's.
* Vocative forms in the persona table (now only through `{{uc::зв}}`).
* Detector: «вы» for a plural persona.
* Upstream: a gender field for personas and `user_avatar` in `getContext()`.
