/* Courier Charge BD - UI. Plain JS, no framework, no network.
   State in localStorage under KEY. All money is whole BDT (taka). */
(function () {
  'use strict';
  var KEY = 'courier-charge-bd-v1';
  var TAKA = '\u09F3';
  var Core = window.COURIER_CORE;
  var DATA = window.COURIER_DATA;
  var I18N = window.COURIER_I18N;

  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.couriers) && Array.isArray(parsed.quotes)) {
          return {
            couriers: parsed.couriers,
            quotes: parsed.quotes,
            lang: parsed.lang === 'bn' ? 'bn' : 'en',
          };
        }
      }
    } catch (e) { /* corrupted state -> start fresh */ }
    return { couriers: [], quotes: [], lang: 'en' };
  }

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }

  function t(key) { return I18N.t(state.lang, key); }
  function isBn() { return state.lang === 'bn'; }

  function fmtNum(n) {
    if (!isFinite(n)) return String(n);
    return Math.round(n).toLocaleString(isBn() ? 'bn-BD' : 'en-US');
  }
  function fmtMoney(n) { return TAKA + ' ' + fmtNum(n); }
  function fmtKg(n) {
    var s = Number(n).toLocaleString(isBn() ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });
    return s + ' ' + t('weightShort');
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  /* ---------- i18n ---------- */
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    document.documentElement.lang = isBn() ? 'bn' : 'en';
    $('lang-toggle').textContent = isBn() ? 'English' : '\u09AC\u09BE\u0982\u09B2\u09BE';
  }

  /* ---------- tabs ---------- */
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = true; });
      $('tab-' + btn.getAttribute('data-tab')).hidden = false;
    });
  });

  $('lang-toggle').addEventListener('click', function () {
    state.lang = isBn() ? 'en' : 'bn';
    saveState();
    applyI18n();
    renderAll();
  });

  /* ---------- courier select + lists ---------- */
  function activeCouriers() { return state.couriers.filter(function (c) { return c.active; }); }

  function refreshCourierSelect() {
    var sel = $('calc-courier');
    var prev = sel.value;
    sel.innerHTML = '';
    state.couriers.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + (c.active ? '' : ' (' + t('inactiveCourier') + ')');
      sel.appendChild(opt);
    });
    if (prev && state.couriers.some(function (c) { return c.id === prev; })) sel.value = prev;
  }

  function renderCouriers() {
    var list = $('couriers-list');
    var empty = $('couriers-empty');
    list.innerHTML = '';
    if (state.couriers.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    state.couriers.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'courier-card' + (c.active ? '' : ' paused');
      var rates = fmtMoney(c.insideBase) + ' / ' + fmtMoney(c.outsideBase) +
        ' \u00B7 ' + fmtMoney(c.perKg) + ' ' + t('perKgShort') +
        ' \u00B7 COD ' + (isBn() ? Number(c.codPercent).toLocaleString('bn-BD') : c.codPercent) + '%' +
        (c.freeAbove > 0 ? ' \u00B7 ' + t('freeAboveShort') + ' ' + fmtMoney(c.freeAbove) : '') +
        ' \u00B7 ' + t('maxWeightShort') + ' ' + (c.maxWeight > 0 ? fmtKg(c.maxWeight) : t('noLimit'));
      card.innerHTML =
        '<h3>' + esc(c.name) +
        (c.example ? ' <span class="badge example">' + esc(t('exampleBadge')) + '</span>' : '') +
        (!c.active ? ' <span class="badge paused">' + esc(t('inactiveCourier')) + '</span>' : '') +
        '</h3><p class="courier-rates">' + esc(rates) + '</p>' +
        '<div class="courier-actions">' +
        '<button type="button" class="btn small" data-act="edit">' + esc(t('editBtn')) + '</button>' +
        '<button type="button" class="btn small" data-act="toggle">' + esc(t(c.active ? 'pauseBtn' : 'resumeBtn')) + '</button>' +
        '<button type="button" class="btn small" data-act="delete">' + esc(t('deleteBtn')) + '</button>' +
        '</div>';
      card.querySelector('[data-act="edit"]').addEventListener('click', function () { startEdit(c.id); });
      card.querySelector('[data-act="toggle"]').addEventListener('click', function () {
        c.active = !c.active; saveState(); renderAll();
      });
      card.querySelector('[data-act="delete"]').addEventListener('click', function () {
        state.couriers = state.couriers.filter(function (x) { return x.id !== c.id; });
        saveState(); renderAll();
        setMsg('courier-msg', t('deleted'), true);
      });
      list.appendChild(card);
    });
  }

  /* ---------- courier form ---------- */
  var editingId = null;

  function readCourierForm() {
    return {
      name: $('c-name').value.trim(),
      insideBase: parseFloat($('c-inside').value),
      outsideBase: parseFloat($('c-outside').value),
      perKg: parseFloat($('c-perkg').value),
      codPercent: parseFloat($('c-codpct').value),
      freeAbove: parseFloat($('c-free').value),
      maxWeight: parseFloat($('c-maxw').value),
    };
  }

  function startEdit(id) {
    var c = state.couriers.find(function (x) { return x.id === id; });
    if (!c) return;
    editingId = id;
    $('c-name').value = c.name;
    $('c-inside').value = c.insideBase;
    $('c-outside').value = c.outsideBase;
    $('c-perkg').value = c.perKg;
    $('c-codpct').value = c.codPercent;
    $('c-free').value = c.freeAbove;
    $('c-maxw').value = c.maxWeight;
    $('courier-form-title').textContent = t('editCourier');
    $('courier-submit').textContent = t('updateBtn');
    $('courier-cancel').hidden = false;
    $('courier-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function resetCourierForm() {
    editingId = null;
    $('courier-form').reset();
    $('courier-form-title').textContent = t('addCourier');
    $('courier-submit').textContent = t('addBtn');
    $('courier-cancel').hidden = true;
    $('courier-errors').innerHTML = '';
  }

  $('courier-cancel').addEventListener('click', resetCourierForm);

  $('courier-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = readCourierForm();
    var errs = Core.validateCourier(c);
    var box = $('courier-errors');
    if (errs.length) {
      box.innerHTML = errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('');
      return;
    }
    box.innerHTML = '';
    if (editingId) {
      var target = state.couriers.find(function (x) { return x.id === editingId; });
      if (target) {
        target.name = c.name; target.insideBase = c.insideBase; target.outsideBase = c.outsideBase;
        target.perKg = c.perKg; target.codPercent = c.codPercent; target.freeAbove = c.freeAbove;
        target.maxWeight = c.maxWeight;
      }
      setMsg('courier-msg', t('courierUpdated'), true);
    } else {
      c.id = Core.newCourierId();
      c.active = true;
      c.example = false;
      state.couriers.push(c);
      setMsg('courier-msg', t('courierAdded'), true);
    }
    saveState();
    resetCourierForm();
    renderAll();
  });

  $('load-examples-btn').addEventListener('click', function () {
    DATA.EXAMPLE_COURIERS.forEach(function (ex) {
      if (!state.couriers.some(function (c) { return c.id === ex.id; })) {
        state.couriers.push(JSON.parse(JSON.stringify(ex)));
      }
    });
    saveState();
    renderAll();
    setMsg('courier-msg', t('examplesLoaded'), true);
  });

  /* ---------- calculate ---------- */
  var lastCalc = null;

  function readParcel(prefix) {
    return {
      weightKg: parseFloat($(prefix + '-weight').value),
      zone: $(prefix + '-zone').value,
      codAmount: parseFloat($(prefix + '-cod').value) || 0,
    };
  }

  function showErrors(boxId, errs) {
    $(boxId).innerHTML = errs.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('');
  }

  $('calc-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var parcel = readParcel('calc');
    var errs = Core.validateParcel(parcel);
    showErrors('calc-errors', errs);
    if (errs.length) { $('calc-result').hidden = true; lastCalc = null; return; }
    var courier = state.couriers.find(function (c) { return c.id === $('calc-courier').value; });
    if (!courier) {
      $('calc-empty').textContent = t('noCouriersCalc');
      $('calc-result').hidden = true;
      lastCalc = null;
      return;
    }
    $('calc-empty').textContent = '';
    var q = Core.quoteFor(courier, parcel);
    if (q.error) {
      showErrors('calc-errors', [q.error]);
      $('calc-result').hidden = true;
      lastCalc = null;
      return;
    }
    lastCalc = { courier: courier, parcel: parcel, quote: q };
    $('calc-result-courier').textContent = courier.name + ' \u00B7 ' +
      t(parcel.zone === 'inside' ? 'zoneInside' : 'zoneOutside') + ' \u00B7 ' + fmtKg(parcel.weightKg) +
      ' \u00B7 ' + t('codAmountShort') + ' ' + fmtMoney(parcel.codAmount);
    $('r-base').textContent = fmtMoney(q.base);
    $('r-extra-label').textContent = t('extraWeight') + ' (' + fmtNum(q.extraKg) + ' ' + t('weightShort') + ' \u00D7 ' + fmtMoney(courier.perKg) + ')';
    $('r-extra').textContent = q.extraKg > 0 ? fmtMoney(q.extraCharge) : fmtMoney(0);
    $('r-delivery').textContent = fmtMoney(q.delivery);
    $('r-cod-label').textContent = t('codFee') + ' (' + (isBn() ? Number(courier.codPercent).toLocaleString('bn-BD') : courier.codPercent) + '% ' + t('codFeeDetail') + ')';
    $('r-cod').textContent = fmtMoney(q.codFee);
    $('r-total').textContent = fmtMoney(q.total);
    $('r-free').hidden = !q.freeDelivery;
    if (q.freeDelivery) $('r-free').textContent = t('freeDelivery');
    var ranked = Core.rankCouriers(activeCouriers(), parcel).ranked;
    var cheapest = ranked.length ? ranked[0] : null;
    $('r-cheapest').textContent = (cheapest && cheapest.courier.id !== courier.id)
      ? t('cheapestHint') + ': ' + cheapest.courier.name + ' \u2014 ' + fmtMoney(cheapest.quote.total) +
        ' (' + fmtMoney(q.total - cheapest.quote.total) + ' ' + t('cheaperThanSelected') + ')'
      : '';
    $('calc-msg').textContent = '';
    $('calc-result').hidden = false;
  });

  $('save-quote-btn').addEventListener('click', function () {
    if (!lastCalc) return;
    var label = $('quote-label').value.trim() ||
      lastCalc.courier.name + ' \u2014 ' + fmtKg(lastCalc.parcel.weightKg);
    state.quotes.unshift({
      label: label,
      courierName: lastCalc.courier.name,
      parcel: lastCalc.parcel,
      quote: lastCalc.quote,
      total: lastCalc.quote.total,
      savedAt: new Date().toISOString(),
    });
    saveState();
    $('quote-label').value = '';
    setMsg('calc-msg', t('quoteSaved'), true);
    renderSaved();
  });

  /* ---------- compare ---------- */
  $('compare-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var parcel = readParcel('cmp');
    var errs = Core.validateParcel(parcel);
    showErrors('cmp-errors', errs);
    if (errs.length) { $('cmp-result').hidden = true; return; }
    if (activeCouriers().length === 0) {
      $('cmp-empty').textContent = t('noCouriersCompare');
      $('cmp-result').hidden = true;
      return;
    }
    $('cmp-empty').textContent = '';
    var res = Core.rankCouriers(activeCouriers(), parcel);
    var body = $('compare-body');
    body.innerHTML = '';
    res.ranked.forEach(function (row, i) {
      var tr = document.createElement('tr');
      if (i === 0) tr.className = 'best-row';
      var nameHtml = esc(row.courier.name) +
        (i === 0 ? ' <span class="badge">' + esc(t('cheapestBadge')) + '</span>' : '') +
        (row.courier.example ? ' <span class="badge example">' + esc(t('exampleBadge')) + '</span>' : '');
      tr.innerHTML =
        '<td>' + fmtNum(i + 1) + '</td><td>' + nameHtml + '</td>' +
        '<td>' + fmtMoney(row.quote.base) + '</td>' +
        '<td>' + fmtMoney(row.quote.extraCharge) + '</td>' +
        '<td>' + fmtMoney(row.quote.delivery) + '</td>' +
        '<td>' + fmtMoney(row.quote.codFee) + '</td>' +
        '<td><strong>' + fmtMoney(row.quote.total) + '</strong></td>';
      body.appendChild(tr);
    });
    var most = res.ranked.length ? res.ranked[res.ranked.length - 1].quote.total : 0;
    var best = res.ranked.length ? res.ranked[0].quote.total : 0;
    $('cmp-saves').textContent = res.ranked.length > 1
      ? t('cheapestBadge') + ': ' + res.ranked[0].courier.name + ' \u2014 ' + fmtMoney(best) +
        ' (' + fmtMoney(most - best) + ' ' + t('savesVsMost') + ')'
      : '';
    var ex = $('cmp-excluded');
    if (res.excluded.length) {
      ex.hidden = false;
      $('excluded-list').innerHTML = res.excluded.map(function (x) {
        return '<li>' + esc(x.courier.name) + ' \u2014 ' + esc(x.reason) + '</li>';
      }).join('');
    } else { ex.hidden = true; }
    $('cmp-result').hidden = false;
  });

  /* ---------- saved quotes ---------- */
  function renderSaved() {
    var list = $('saved-list');
    var empty = $('saved-empty');
    list.innerHTML = '';
    if (state.quotes.length === 0) {
      empty.textContent = t('savedEmpty');
      return;
    }
    empty.textContent = '';
    state.quotes.forEach(function (q, idx) {
      var item = document.createElement('div');
      item.className = 'saved-item';
      var when = '';
      try { when = new Date(q.savedAt).toLocaleDateString(isBn() ? 'bn-BD' : 'en-GB'); } catch (e) { when = ''; }
      item.innerHTML =
        '<div><strong>' + esc(q.label) + '</strong>' +
        '<div class="meta">' + esc(q.courierName) + ' \u00B7 ' +
        t(q.parcel.zone === 'inside' ? 'zoneInside' : 'zoneOutside') + ' \u00B7 ' +
        fmtKg(q.parcel.weightKg) + ' \u00B7 ' + t('codAmountShort') + ' ' + fmtMoney(q.parcel.codAmount) +
        (when ? ' \u00B7 ' + esc(when) : '') + '</div></div>' +
        '<span class="total">' + fmtMoney(q.total) + '</span>' +
        '<button type="button" class="btn small">' + esc(t('deleteBtn')) + '</button>';
      item.querySelector('button').addEventListener('click', function () {
        state.quotes.splice(idx, 1);
        saveState();
        renderSaved();
      });
      list.appendChild(item);
    });
  }

  /* ---------- backup / erase ---------- */
  $('export-btn').addEventListener('click', function () {
    $('export-text').value = JSON.stringify({
      app: 'courier-charge-bd',
      version: 1,
      couriers: state.couriers,
      quotes: state.quotes,
    }, null, 2);
    setMsg('data-msg', '', true);
  });

  $('import-btn').addEventListener('click', function () {
    var raw = $('import-text').value.trim();
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) { /* falls through to invalid */ }
    var errs = obj ? Core.validateBackup(obj) : [t('importBad') + 'not JSON'];
    if (errs.length) {
      setMsg('data-msg', t('importBad') + errs.join('; '), false);
      return;
    }
    state.couriers = obj.couriers;
    state.quotes = obj.quotes || [];
    saveState();
    renderAll();
    setMsg('data-msg', t('importOk'), true);
  });

  $('erase-btn').addEventListener('click', function () {
    if ($('erase-input').value.trim() !== 'DELETE') {
      setMsg('data-msg', t('eraseNeed'), false);
      return;
    }
    state.couriers = [];
    state.quotes = [];
    lastCalc = null;
    $('erase-input').value = '';
    $('calc-result').hidden = true;
    $('cmp-result').hidden = true;
    saveState();
    renderAll();
    setMsg('data-msg', t('erased'), true);
  });

  /* ---------- helpers / boot ---------- */
  function setMsg(id, text, ok) {
    var el = $(id);
    el.textContent = text;
    el.className = 'msg' + (text ? (ok ? ' ok' : ' bad') : '');
  }

  function renderAll() {
    refreshCourierSelect();
    renderCouriers();
    renderSaved();
    $('calc-empty').textContent = state.couriers.length === 0 ? t('noCouriersCalc') : '';
  }

  applyI18n();
  renderAll();
})();
