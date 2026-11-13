# TEST_RESULTS.md — Courier Charge BD (run #319)

## Unit tests (Node, no DOM)

Command: `node --test tests/unit.test.mjs`
Result: **18/18 pass, 0 fail**

Covered: extra-kg rounding (1.01 kg = 1 extra kg, 2.5 kg = 2, 3.01 kg = 3),
COD fee rounding (333 BDT at 1.5% = 5), quote math on all three example
couriers (A 2.5 kg inside COD 2000 = 120; A 1 kg prepaid = 60; A 0.5 kg
outside COD 500 = 125; B free delivery at threshold = 0 total; B just below
threshold = 130; C 3 kg outside = 160; over-max-weight error; COD fee still
applies when delivery is free), ranking order + exclusions, paused-courier
skip, parcel/courier/backup validation, i18n key parity (95 keys), example
data validity.

One repair cycle (test-side only): the i18n parity test asserted BN != EN
for every key, but `colRank` is the symbol "#" in both languages. The test
was corrected to skip symbol-only keys; no app code changed.

## Smoke tests (headless Chrome, raw CDP, file://)

Command: `node tests/smoke.mjs 1280` and `node tests/smoke.mjs 390`
Result: **44/44 pass at 1280px, 44/44 pass at 390px**

Covered: title/h1/tabs render, empty state before any courier exists,
example rate cards load (3 cards, example badges, localStorage persist),
calculate flow (Example A 2.5 kg inside COD 2000 = total 120, base 60,
extra 40, COD fee 20, cheapest hint names Courier B), save quote (message +
localStorage), validation rejection (weight 0), compare flow (6 kg inside:
B 145 cheapest, A 160, C excluded for max weight), free-delivery flow
(Example B 1 kg outside COD 6000 = total 0 + note shown), custom courier
add + pause, courier form validation (empty name rejected, no card added),
EN/BN toggle (title changes, Bengali digits appear, toggle back), saved
tab (quote listed, total 120), export fills backup JSON, bad import
rejected with state intact, erase requires exact DELETE then wipes all,
empty state returns after erase + reload. Zero console errors, zero page
exceptions, zero non-file network requests at both widths.

One repair cycle (app-side, real defect): `js/core.js`, `js/data.js` and
`js/i18n.js` each declared a top-level `const api` in the shared global
scope of classic scripts, so data.js/i18n.js threw "Identifier 'api' has
already been declared" and the app never booted. Fixed by renaming to
`CORE_API` / `DATA_API` / `I18N_API` (generator patched too, then
regenerated). Re-ran: unit 18/18, smoke 44/44 at both widths.

## Source hygiene

- `grep -P '[^\x00-\x7F]'` over index.html, styles.css, js/*.js: zero
  matches (Bengali only as `\uXXXX` escapes in js/i18n.js; HTML uses
  numeric entities). Push-safe for non-ASCII argv transport.

## Manual checks

- Formula spot-checks cross-verified by hand in the unit tests above
  (120 / 145 / 160 / 0 totals all hand-computed from the rate cards).
- No fabricated data: the only shipped rates are the three labelled
  fictional example cards; the app ships with no couriers until the user
  adds some or loads the examples.
