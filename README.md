# Courier Charge BD

Compare parcel delivery charges across Bangladeshi couriers before you ship —
an offline, bilingual (English / Bangla) web app.

Online sellers in Bangladesh juggle several couriers, and each one prices a
parcel differently: a different base charge inside vs outside Dhaka, a
different per-kg charge after the first kilo, a different cash-on-delivery
fee, and sometimes free delivery above an order value. Courier Charge BD
lets you enter each courier's rate card once, then calculates the exact
charge for any parcel — base + extra weight + COD fee — and ranks every
courier cheapest-first, so the real cheapest option is obvious instead of
the one with the smallest headline base rate.

## Features

- **Charge calculator** — pick a courier, zone (Inside / Outside Dhaka),
  parcel weight and COD amount, and see the full breakdown: base charge
  (first 1 kg), extra weight (every started kg beyond the first, at the
  courier's per-kg rate), delivery charge, COD fee, and total. Free
  delivery is applied automatically when the COD amount reaches the
  courier's threshold — the COD fee still applies, and the app says so.
- **Cheapest-first comparison** — enter one parcel and see every active
  courier in a ranked table with the cheapest badge and the amount saved
  versus the most expensive. Couriers the parcel does not fit (over their
  max weight) are listed separately with the reason, not silently hidden.
- **Rate-card manager** — add, edit, pause, and delete couriers: name,
  inside/outside Dhaka base, per-kg extra charge, COD fee %, free-delivery
  threshold, and max parcel weight. Ships empty; three clearly-labelled
  fictional example rate cards load on one tap so the app can be tried
  immediately.
- **Saved quotes** — save any calculated quote with a label, review it
  later, delete it, and export or import the whole dataset as JSON with
  strict validation. Erase-all requires typing `DELETE`.
- **Bilingual EN / Bangla** — full UI toggle, persisted, with Bengali
  digits in Bengali mode. Works at 390px mobile width with no horizontal
  overflow.
- **100% offline** — no account, no server, no network requests at all.
  Everything lives in `localStorage` on the device.

## Stack

- Plain HTML + CSS + JavaScript — no framework, no build step, no
  dependencies, no CDN. Open `index.html` and it works.
- `js/core.js` — pure calculation + validation logic (charge math,
  free-delivery rule, ranking, backup validation), unit-tested from Node
  with no DOM.
- `js/data.js` — the three fictional example rate cards.
- `js/i18n.js` — EN/BN strings (generated from `.scratch/gen_i18n.py`;
  Bengali stored as `\uXXXX` escapes so sources stay pure ASCII).
- `js/app.js` — UI: tabs, forms, ranking table, rate cards, saved quotes,
  backup.
- State lives in `localStorage` under `courier-charge-bd-v1`.

## Prerequisites

Any modern browser. Nothing to install. For the tests: Node.js 18+ and
the Playwright-cached `headless_shell` used by the smoke tests (already
present on the factory VM).

## Install & run

```sh
# just open it — no build step
open index.html
# or serve it locally
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Testing

```sh
node --test tests/unit.test.mjs   # 18 unit tests (charge math, ranking, validation, i18n)
node tests/smoke.mjs 1280         # 44 headless-Chrome checks (desktop)
node tests/smoke.mjs 390          # 44 headless-Chrome checks (mobile)
```

Real results for this release are in `TEST_RESULTS.md`: 18/18 unit,
44/44 smoke at 1280px, 44/44 smoke at 390px, 0 console/page errors,
0 non-file network requests.

## How charges are calculated

1. The first 1 kg is covered by the base charge (inside or outside Dhaka).
2. Every started kg after the first adds the courier's per-kg charge
   (2.5 kg = 2 extra kg; 3.01 kg = 3 extra kg).
3. The COD fee is a percentage of the cash-on-delivery amount, rounded to
   the nearest taka.
4. If the COD amount reaches the courier's free-delivery threshold, the
   delivery charge is waived. The COD fee still applies.
5. If the parcel is heavier than a courier's max weight, that courier is
   excluded from the comparison with the reason shown.

## Limitations

- The three example rate cards are **fictional** — they are not real
  courier prices. Enter the rates from a courier's current rate card
  before relying on a quote.
- No live rates: courier prices change, and this app has no network
  access by design. Always confirm the current rate with the courier
  before shipping.
- Charges are whole taka (rounded to the nearest taka); a courier that
  bills in paisa will differ by a few paisa.
- Data lives only in the browser's `localStorage` — clearing browser data
  erases it unless you exported a backup first.

## Status

MVP, complete and tested. Single-page offline app; no backend, no
accounts, no tracking.
