/* Courier Charge BD - pure calculation + validation logic.
   Works in Node (module.exports) and in the browser (window.COURIER_CORE).
   No DOM, no network, no storage access here. All money is whole BDT (taka). */

const MAX_WEIGHT_KG = 50;
const MAX_COD_BDT = 1000000;
const MAX_CHARGE_BDT = 100000;
const MAX_COD_PERCENT = 10;

function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Extra-weight charge: first 1 kg is included in the base charge.
 *  Every started kg beyond the first costs perKg. */
function extraWeightKg(weightKg) {
  if (!isFiniteNumber(weightKg) || weightKg <= 1) return 0;
  return Math.ceil(weightKg - 1 - 1e-9);
}

function extraWeightCharge(weightKg, perKg) {
  return extraWeightKg(weightKg) * perKg;
}

/** COD fee: codPercent % of the COD amount, rounded to the nearest taka. */
function codFee(codAmount, codPercent) {
  if (!codAmount || !codPercent) return 0;
  return Math.round((codAmount * codPercent) / 100);
}

/** Full quote for one courier + one parcel.
 *  parcel: { weightKg, zone: 'inside' | 'outside', codAmount }
 *  Returns { base, extraKg, extraCharge, delivery, freeDelivery, codFee, total }
 *  or { error: '...' } when the parcel is invalid for this courier. */
function quoteFor(courier, parcel) {
  const perrors = validateParcel(parcel);
  if (perrors.length) return { error: perrors[0] };
  const cerrors = validateCourier(courier);
  if (cerrors.length) return { error: cerrors[0] };
  if (courier.maxWeight > 0 && parcel.weightKg > courier.maxWeight) {
    return { error: 'over max weight (' + courier.maxWeight + ' kg)' };
  }
  const base = parcel.zone === 'inside' ? courier.insideBase : courier.outsideBase;
  const extraKg = extraWeightKg(parcel.weightKg);
  const extraCharge = extraKg * courier.perKg;
  let delivery = base + extraCharge;
  const freeDelivery = courier.freeAbove > 0 && parcel.codAmount >= courier.freeAbove;
  if (freeDelivery) delivery = 0;
  const fee = codFee(parcel.codAmount, courier.codPercent);
  return {
    base,
    extraKg,
    extraCharge,
    delivery,
    freeDelivery,
    codFee: fee,
    total: delivery + fee,
  };
}

/** Rank all active couriers for a parcel, cheapest first.
 *  Returns { ranked: [{ courier, quote }], excluded: [{ courier, reason }] }. */
function rankCouriers(couriers, parcel) {
  const ranked = [];
  const excluded = [];
  for (const c of couriers || []) {
    if (!c.active) continue;
    const q = quoteFor(c, parcel);
    if (q.error) excluded.push({ courier: c, reason: q.error });
    else ranked.push({ courier: c, quote: q });
  }
  ranked.sort((a, b) => a.quote.total - b.quote.total || a.courier.name.localeCompare(b.courier.name));
  return { ranked, excluded };
}

function validateParcel(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['parcel is missing'];
  if (!isFiniteNumber(p.weightKg) || p.weightKg < 0.1 || p.weightKg > MAX_WEIGHT_KG) {
    errs.push('weight must be between 0.1 and ' + MAX_WEIGHT_KG + ' kg');
  }
  if (p.zone !== 'inside' && p.zone !== 'outside') errs.push('zone must be inside or outside Dhaka');
  if (!isFiniteNumber(p.codAmount) || p.codAmount < 0 || p.codAmount > MAX_COD_BDT) {
    errs.push('COD amount must be between 0 and ' + MAX_COD_BDT.toLocaleString('en-US') + ' BDT');
  }
  return errs;
}

function validateCourier(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['courier is missing'];
  if (typeof c.name !== 'string' || c.name.trim().length === 0) errs.push('courier name is required');
  else if (c.name.trim().length > 60) errs.push('courier name must be 60 characters or less');
  for (const f of ['insideBase', 'outsideBase', 'perKg']) {
    if (!isFiniteNumber(c[f]) || c[f] < 0 || c[f] > MAX_CHARGE_BDT) {
      errs.push(f + ' must be between 0 and ' + MAX_CHARGE_BDT.toLocaleString('en-US') + ' BDT');
    }
  }
  if (!isFiniteNumber(c.codPercent) || c.codPercent < 0 || c.codPercent > MAX_COD_PERCENT) {
    errs.push('COD fee must be between 0 and ' + MAX_COD_PERCENT + '%');
  }
  if (!isFiniteNumber(c.freeAbove) || c.freeAbove < 0 || c.freeAbove > MAX_COD_BDT) {
    errs.push('free-delivery threshold must be between 0 and ' + MAX_COD_BDT.toLocaleString('en-US') + ' BDT (0 = never free)');
  }
  if (!isFiniteNumber(c.maxWeight) || c.maxWeight < 0 || c.maxWeight > MAX_WEIGHT_KG) {
    errs.push('max weight must be between 0 (no limit) and ' + MAX_WEIGHT_KG + ' kg');
  }
  return errs;
}

/** Strict validation for an imported backup object. Returns an array of errors. */
function validateBackup(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object' || obj.app !== 'courier-charge-bd') {
    return ['not a Courier Charge BD backup (app field must be "courier-charge-bd")'];
  }
  if (!Array.isArray(obj.couriers)) errs.push('couriers must be a list');
  else {
    if (obj.couriers.length > 50) errs.push('at most 50 couriers can be imported');
    obj.couriers.forEach((c, i) => {
      validateCourier(c).forEach((e) => errs.push('courier ' + (i + 1) + ': ' + e));
    });
  }
  if (obj.quotes !== undefined) {
    if (!Array.isArray(obj.quotes)) errs.push('quotes must be a list');
    else {
      if (obj.quotes.length > 200) errs.push('at most 200 quotes can be imported');
      obj.quotes.forEach((q, i) => {
        if (!q || typeof q !== 'object') { errs.push('quote ' + (i + 1) + ': not an object'); return; }
        if (typeof q.label !== 'string' || !q.label.trim()) errs.push('quote ' + (i + 1) + ': label is required');
        if (typeof q.courierName !== 'string' || !q.courierName.trim()) errs.push('quote ' + (i + 1) + ': courierName is required');
        validateParcel(q.parcel).forEach((e) => errs.push('quote ' + (i + 1) + ': ' + e));
        if (!isFiniteNumber(q.total) || q.total < 0) errs.push('quote ' + (i + 1) + ': total is invalid');
      });
    }
  }
  return errs;
}

function newCourierId() {
  return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

const CORE_API = {
  MAX_WEIGHT_KG,
  MAX_COD_BDT,
  MAX_CHARGE_BDT,
  MAX_COD_PERCENT,
  extraWeightKg,
  extraWeightCharge,
  codFee,
  quoteFor,
  rankCouriers,
  validateParcel,
  validateCourier,
  validateBackup,
  newCourierId,
};

if (typeof module !== 'undefined' && module.exports) module.exports = CORE_API;
if (typeof window !== 'undefined') window.COURIER_CORE = CORE_API;
