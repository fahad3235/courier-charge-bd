/* Courier Charge BD - node unit tests. Run: node --test tests/unit.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../js/core.js');
const DATA = require('../js/data.js');
const I18N = require('../js/i18n.js');

const A = DATA.EXAMPLE_COURIERS[0]; // inside 60, outside 120, perKg 20, COD 1%, free 0, max 10
const B = DATA.EXAMPLE_COURIERS[1]; // inside 70, outside 130, perKg 15, COD 0%, free 5000, max 20
const C = DATA.EXAMPLE_COURIERS[2]; // inside 50, outside 100, perKg 30, COD 1.5%, free 0, max 5

test('extraWeightKg: first kg free, started kg charged', () => {
  assert.equal(Core.extraWeightKg(0.5), 0);
  assert.equal(Core.extraWeightKg(1), 0);
  assert.equal(Core.extraWeightKg(1.01), 1);
  assert.equal(Core.extraWeightKg(2.5), 2);
  assert.equal(Core.extraWeightKg(3), 2);
  assert.equal(Core.extraWeightKg(3.01), 3);
});

test('codFee: percentage rounded to nearest taka', () => {
  assert.equal(Core.codFee(2000, 1), 20);
  assert.equal(Core.codFee(333, 1.5), 5); // 4.995 -> 5
  assert.equal(Core.codFee(1000, 0), 0);
  assert.equal(Core.codFee(0, 1.5), 0);
});

test('quoteFor A: 2.5kg inside COD 2000 = 60 + 40 + 20 = 120', () => {
  const q = Core.quoteFor(A, { weightKg: 2.5, zone: 'inside', codAmount: 2000 });
  assert.deepEqual(q, { base: 60, extraKg: 2, extraCharge: 40, delivery: 100, freeDelivery: false, codFee: 20, total: 120 });
});

test('quoteFor A: 1kg inside prepaid = base only', () => {
  const q = Core.quoteFor(A, { weightKg: 1, zone: 'inside', codAmount: 0 });
  assert.equal(q.total, 60);
  assert.equal(q.delivery, 60);
  assert.equal(q.codFee, 0);
});

test('quoteFor A: 0.5kg outside COD 500 = 120 + 5 = 125', () => {
  const q = Core.quoteFor(A, { weightKg: 0.5, zone: 'outside', codAmount: 500 });
  assert.equal(q.total, 125);
});

test('quoteFor B: free delivery at threshold, COD fee still 0% = 0 total', () => {
  const q = Core.quoteFor(B, { weightKg: 1, zone: 'outside', codAmount: 6000 });
  assert.equal(q.freeDelivery, true);
  assert.equal(q.delivery, 0);
  assert.equal(q.total, 0);
});

test('quoteFor B: just below threshold pays full delivery', () => {
  const q = Core.quoteFor(B, { weightKg: 1, zone: 'outside', codAmount: 4999 });
  assert.equal(q.freeDelivery, false);
  assert.equal(q.total, 130);
});

test('quoteFor B: 3kg inside COD 1000 = 70 + 30 = 100', () => {
  const q = Core.quoteFor(B, { weightKg: 3, zone: 'inside', codAmount: 1000 });
  assert.equal(q.total, 100);
});

test('quoteFor C: 3kg outside prepaid = 100 + 60 = 160', () => {
  const q = Core.quoteFor(C, { weightKg: 3, zone: 'outside', codAmount: 0 });
  assert.equal(q.total, 160);
});

test('quoteFor C: over max weight is an error, not a number', () => {
  const q = Core.quoteFor(C, { weightKg: 6, zone: 'inside', codAmount: 0 });
  assert.ok(q.error && q.error.includes('max weight'));
});

test('quoteFor: COD fee applies even when delivery is free', () => {
  const d = { name: 'D', insideBase: 80, outsideBase: 140, perKg: 10, codPercent: 2, freeAbove: 1000, maxWeight: 0, active: true };
  const q = Core.quoteFor(d, { weightKg: 1, zone: 'inside', codAmount: 2000 });
  assert.equal(q.delivery, 0);
  assert.equal(q.codFee, 40);
  assert.equal(q.total, 40);
});

test('rankCouriers: cheapest first, over-weight excluded', () => {
  const parcel = { weightKg: 6, zone: 'inside', codAmount: 0 };
  const res = Core.rankCouriers([A, B, C], parcel);
  // A: 60 + 5*20 = 160 ; B: 70 + 5*15 = 145 ; C excluded (max 5)
  assert.equal(res.ranked.length, 2);
  assert.equal(res.ranked[0].courier.name, 'Example Courier B');
  assert.equal(res.ranked[0].quote.total, 145);
  assert.equal(res.ranked[1].quote.total, 160);
  assert.equal(res.excluded.length, 1);
  assert.equal(res.excluded[0].courier.name, 'Example Courier C');
});

test('rankCouriers: paused couriers are skipped', () => {
  const paused = { ...A, active: false };
  const res = Core.rankCouriers([paused, B], { weightKg: 1, zone: 'inside', codAmount: 0 });
  assert.equal(res.ranked.length, 1);
  assert.equal(res.ranked[0].courier.name, 'Example Courier B');
});

test('validateParcel: rejects bad weight, zone, COD', () => {
  assert.ok(Core.validateParcel({ weightKg: 0, zone: 'inside', codAmount: 0 }).length > 0);
  assert.ok(Core.validateParcel({ weightKg: 51, zone: 'inside', codAmount: 0 }).length > 0);
  assert.ok(Core.validateParcel({ weightKg: 1, zone: 'nowhere', codAmount: 0 }).length > 0);
  assert.ok(Core.validateParcel({ weightKg: 1, zone: 'inside', codAmount: -5 }).length > 0);
  assert.ok(Core.validateParcel({ weightKg: 1, zone: 'inside', codAmount: 1000001 }).length > 0);
  assert.deepEqual(Core.validateParcel({ weightKg: 2.5, zone: 'outside', codAmount: 100 }), []);
});

test('validateCourier: rejects empty name, negative charge, COD over 10%', () => {
  const bad = { name: ' ', insideBase: -1, outsideBase: 100, perKg: 10, codPercent: 11, freeAbove: 0, maxWeight: 0 };
  const errs = Core.validateCourier(bad);
  assert.ok(errs.length >= 3, errs.join('; '));
  const good = { name: 'X', insideBase: 60, outsideBase: 120, perKg: 20, codPercent: 1, freeAbove: 0, maxWeight: 10 };
  assert.deepEqual(Core.validateCourier(good), []);
});

test('validateBackup: accepts a good backup, rejects wrong app and bad couriers', () => {
  const good = {
    app: 'courier-charge-bd',
    couriers: [JSON.parse(JSON.stringify(A))],
    quotes: [{ label: 'Test', courierName: 'Example Courier A', parcel: { weightKg: 1, zone: 'inside', codAmount: 0 }, total: 60 }],
  };
  assert.deepEqual(Core.validateBackup(good), []);
  assert.ok(Core.validateBackup({ app: 'nope' }).length > 0);
  assert.ok(Core.validateBackup({ app: 'courier-charge-bd', couriers: [{ name: '' }] }).length > 0);
  assert.ok(Core.validateBackup({ app: 'courier-charge-bd', couriers: [], quotes: [{ label: '' }] }).length > 0);
  assert.ok(Core.validateBackup('not json').length > 0);
});

test('i18n: every EN key has a BN string, and key sets match', () => {
  const enKeys = Object.keys(I18N.STRINGS.en).sort();
  const bnKeys = Object.keys(I18N.STRINGS.bn).sort();
  assert.deepEqual(bnKeys, enKeys);
  for (const k of enKeys) {
    assert.ok(I18N.STRINGS.bn[k].length > 0, 'empty BN for ' + k);
    // symbol-only keys (e.g. "#") are legitimately identical in both languages
    if (/[A-Za-z]/.test(I18N.STRINGS.en[k])) {
      assert.notEqual(I18N.STRINGS.bn[k], I18N.STRINGS.en[k], 'BN same as EN for ' + k);
    }
  }
  assert.equal(I18N.t('bn', 'appTitle'), '\u0995\u09c1\u09b0\u09bf\u09af\u09bc\u09be\u09b0 \u099a\u09be\u09b0\u09cd\u099c \u09ac\u09bf\u09a1\u09bf');
});

test('data: three example couriers, all valid, all flagged example', () => {
  assert.equal(DATA.EXAMPLE_COURIERS.length, 3);
  for (const c of DATA.EXAMPLE_COURIERS) {
    assert.deepEqual(Core.validateCourier(c), []);
    assert.equal(c.example, true);
    assert.equal(c.active, true);
  }
});
