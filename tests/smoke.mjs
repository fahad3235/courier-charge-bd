/* Courier Charge BD \u2014 headless-Chrome smoke tests via raw CDP (no deps).
   Run: node tests/smoke.mjs [width]   (default 1280; pass 390 for mobile)
   Uses the Playwright-cached headless_shell. Serves the app over file:// */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell');
const WIDTH = parseInt(process.argv[2] || '1280', 10);
const HEIGHT = 900;
const PORT = 9334;

let failures = [];
let checks = 0;
function check(name, cond, extra = '') {
  checks++;
  if (cond) console.log('  PASS ' + name);
  else { failures.push(name + (extra ? ' \u2014 ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' \u2014 ' + extra : '')); }
}

const chrome = spawn(SHELL, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      return j.webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('CDP did not start');
}

async function main() {
  const browserWs = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { browserWs.onopen = res; browserWs.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  const events = [];
  browserWs.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    browserWs.send(JSON.stringify({ id, method, params }));
  });

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const targetId = target.result.targetId;
  const attached = await send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  const sendS = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    browserWs.send(JSON.stringify({ id, sessionId, method, params }));
  });

  await sendS('Runtime.enable');
  await sendS('Page.enable');
  await sendS('Network.enable');
  await sendS('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 500 });

  const consoleErrors = [];
  const pageErrors = [];
  const extRequests = [];
  const origOnMessage = browserWs.onmessage;
  browserWs.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
    }
    if (m.sessionId === sessionId && m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (m.sessionId === sessionId && m.method === 'Network.requestWillBeSent') {
      const url = m.params.request.url;
      if (!url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('chrome')) {
        extRequests.push(url);
      }
    }
    origOnMessage(ev);
  };

  const evalJs = async (expr) => {
    const r = await sendS('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  const fileUrl = 'file://' + path.join(ROOT, 'index.html');
  await sendS('Page.navigate', { url: fileUrl });
  await sleep(1200);

  console.log(`== smoke @ ${WIDTH}px ==`);

  check('page title', (await evalJs('document.title')).includes('Courier Charge BD'));
  check('h1 renders', (await evalJs(`document.getElementById('app-title').textContent`)) === 'Courier Charge BD');
  check('4 tabs present', (await evalJs(`document.querySelectorAll('.tab-btn').length`)) === 4);
  check('empty state: no couriers yet', (await evalJs(`document.getElementById('calc-empty').textContent`)).includes('Add a courier first'),
    await evalJs(`document.getElementById('calc-empty').textContent`));
  check('no horizontal overflow (calculate)', (await evalJs('document.documentElement.scrollWidth')) <= WIDTH + 1,
    'scrollWidth=' + (await evalJs('document.documentElement.scrollWidth')));

  // --- load example rate cards ---
  await evalJs(`document.querySelector('[data-tab="couriers"]').click()`);
  await sleep(200);
  await evalJs(`document.getElementById('load-examples-btn').click()`);
  await sleep(250);
  check('3 example courier cards render', (await evalJs(`document.querySelectorAll('.courier-card').length`)) === 3);
  check('example badges shown', (await evalJs(`document.querySelectorAll('.courier-card .badge.example').length`)) === 3);
  check('state persisted to localStorage', (await evalJs(`JSON.parse(localStorage.getItem('courier-charge-bd-v1')).couriers.length`)) === 3);

  // --- calculate: Example A, 2.5kg inside, COD 2000 -> total 120 ---
  await evalJs(`document.querySelector('[data-tab="calculate"]').click()`);
  await sleep(200);
  await evalJs(`(function(){
    document.getElementById('calc-courier').value = 'example-a';
    document.getElementById('calc-zone').value = 'inside';
    document.getElementById('calc-weight').value = '2.5';
    document.getElementById('calc-cod').value = '2000';
    document.querySelector('#calc-form button[type="submit"]').click();
  })()`);
  await sleep(250);
  check('result card shows', (await evalJs(`document.getElementById('calc-result').hidden`)) === false);
  check('total is 120', (await evalJs(`document.getElementById('r-total').textContent`)).includes('120'),
    await evalJs(`document.getElementById('r-total').textContent`));
  check('base 60 shown', (await evalJs(`document.getElementById('r-base').textContent`)).includes('60'));
  check('extra 40 shown', (await evalJs(`document.getElementById('r-extra').textContent`)).includes('40'));
  check('COD fee 20 shown', (await evalJs(`document.getElementById('r-cod').textContent`)).includes('20'));
  check('cheapest hint names Courier B', (await evalJs(`document.getElementById('r-cheapest').textContent`)).includes('Example Courier B'),
    await evalJs(`document.getElementById('r-cheapest').textContent`));

  // --- save the quote ---
  await evalJs(`(function(){ document.getElementById('quote-label').value = 'Smoke test parcel'; document.getElementById('save-quote-btn').click(); })()`);
  await sleep(200);
  check('quote saved message', (await evalJs(`document.getElementById('calc-msg').textContent`)).includes('saved'));
  check('quote in localStorage', (await evalJs(`JSON.parse(localStorage.getItem('courier-charge-bd-v1')).quotes.length`)) === 1);

  // --- validation: weight 0 rejected ---
  await evalJs(`(function(){ document.getElementById('calc-weight').value = '0'; document.querySelector('#calc-form button[type="submit"]').click(); })()`);
  await sleep(200);
  check('validation error shown', (await evalJs(`document.getElementById('calc-errors').textContent`)).includes('weight'),
    await evalJs(`document.getElementById('calc-errors').textContent`));

  // --- compare: 6kg inside, COD 0 -> B cheapest (145), A 160, C excluded ---
  await evalJs(`document.querySelector('[data-tab="compare"]').click()`);
  await sleep(200);
  await evalJs(`(function(){
    document.getElementById('cmp-zone').value = 'inside';
    document.getElementById('cmp-weight').value = '6';
    document.getElementById('cmp-cod').value = '0';
    document.querySelector('#compare-form button[type="submit"]').click();
  })()`);
  await sleep(250);
  check('compare table has 2 rows', (await evalJs(`document.querySelectorAll('#compare-body tr').length`)) === 2);
  check('cheapest row is Courier B', (await evalJs(`document.querySelector('#compare-body tr td:nth-child(2)').textContent`)).includes('Example Courier B'));
  check('B total is 145', (await evalJs(`document.querySelector('#compare-body tr td:last-child').textContent`)).includes('145'));
  check('best-row class on cheapest', (await evalJs(`document.querySelectorAll('#compare-body tr.best-row').length`)) === 1);
  check('excluded section lists Courier C', (await evalJs(`document.getElementById('excluded-list').textContent`)).includes('Example Courier C'));
  check('no horizontal overflow (compare)', (await evalJs('document.documentElement.scrollWidth')) <= WIDTH + 1);

  // --- free delivery: B, 1kg outside, COD 6000 -> total 0 ---
  await evalJs(`document.querySelector('[data-tab="calculate"]').click()`);
  await sleep(200);
  await evalJs(`(function(){
    document.getElementById('calc-courier').value = 'example-b';
    document.getElementById('calc-zone').value = 'outside';
    document.getElementById('calc-weight').value = '1';
    document.getElementById('calc-cod').value = '6000';
    document.querySelector('#calc-form button[type="submit"]').click();
  })()`);
  await sleep(250);
  check('free-delivery total is 0', (await evalJs(`document.getElementById('r-total').textContent`)).includes('0'));
  check('free-delivery note shown', (await evalJs(`document.getElementById('r-free').hidden`)) === false);

  // --- add a custom courier, then pause it ---
  await evalJs(`document.querySelector('[data-tab="couriers"]').click()`);
  await sleep(200);
  await evalJs(`(function(){
    document.getElementById('c-name').value = 'Smoke Courier';
    document.getElementById('c-inside').value = '55';
    document.getElementById('c-outside').value = '110';
    document.getElementById('c-perkg').value = '10';
    document.getElementById('c-codpct').value = '0.5';
    document.getElementById('c-free').value = '0';
    document.getElementById('c-maxw').value = '8';
    document.getElementById('courier-submit').click();
  })()`);
  await sleep(250);
  check('custom courier added (4 cards)', (await evalJs(`document.querySelectorAll('.courier-card').length`)) === 4);
  await evalJs(`(function(){ document.querySelectorAll('.courier-card')[3].querySelector('[data-act="toggle"]').click(); })()`);
  await sleep(200);
  check('paused badge appears', (await evalJs(`document.querySelectorAll('.courier-card.paused').length`)) === 1);

  // --- courier form validation: empty name rejected ---
  await evalJs(`(function(){ document.getElementById('c-name').value = ''; document.getElementById('courier-submit').click(); })()`);
  await sleep(200);
  check('courier validation error shown', (await evalJs(`document.getElementById('courier-errors').textContent`)).includes('name'));
  check('invalid courier not added', (await evalJs(`document.querySelectorAll('.courier-card').length`)) === 4);

  // --- language toggle ---
  await evalJs(`document.getElementById('lang-toggle').click()`);
  await sleep(250);
  check('BN toggle changes title', (await evalJs(`document.getElementById('app-title').textContent`)) === '\u0995\u09c1\u09b0\u09bf\u09af\u09bc\u09be\u09b0 \u099a\u09be\u09b0\u09cd\u099c \u09ac\u09bf\u09a1\u09bf');
  check('BN digits appear in courier card', /[\u09e6-\u09ef]/.test(await evalJs(`document.querySelector('.courier-card').textContent`)));
  await evalJs(`document.getElementById('lang-toggle').click()`);
  await sleep(200);
  check('toggle back to English', (await evalJs(`document.getElementById('app-title').textContent`)) === 'Courier Charge BD');

  // --- saved tab: quote listed, bad import rejected, erase flow ---
  await evalJs(`document.querySelector('[data-tab="saved"]').click()`);
  await sleep(200);
  check('saved quote listed', (await evalJs(`document.querySelectorAll('.saved-item').length`)) === 1);
  check('saved total 120 shown', (await evalJs(`document.querySelector('.saved-item .total').textContent`)).includes('120'));
  await evalJs(`(function(){ document.getElementById('export-btn').click(); })()`);
  await sleep(150);
  check('export fills textarea with backup', (await evalJs(`document.getElementById('export-text').value`)).includes('courier-charge-bd'));
  await evalJs(`(function(){ document.getElementById('import-text').value='{"app":"nope"}'; document.getElementById('import-btn').click(); })()`);
  await sleep(200);
  check('bad import rejected', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('not valid'));
  check('bad import keeps 4 couriers', (await evalJs(`JSON.parse(localStorage.getItem('courier-charge-bd-v1')).couriers.length`)) === 4);
  await evalJs(`(function(){ document.getElementById('erase-input').value='delete'; document.getElementById('erase-btn').click(); })()`);
  await sleep(150);
  check('erase requires exact DELETE', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('DELETE'));
  await evalJs(`(function(){ document.getElementById('erase-input').value='DELETE'; document.getElementById('erase-btn').click(); })()`);
  await sleep(200);
  check('erase confirms', (await evalJs(`document.getElementById('data-msg').textContent`)).includes('erased'));
  check('erase wipes couriers', (await evalJs(`JSON.parse(localStorage.getItem('courier-charge-bd-v1')).couriers.length`)) === 0);

  // --- reload persistence: empty state after erase ---
  await sendS('Page.navigate', { url: fileUrl });
  await sleep(1000);
  check('empty state shows after erase + reload', (await evalJs(`document.getElementById('calc-empty').textContent`)).includes('Add a courier first'));

  // --- error / network hygiene ---
  check('zero console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('zero page exceptions', pageErrors.length === 0, pageErrors.join(' | '));
  check('zero non-file network requests', extRequests.length === 0, extRequests.join(', '));

  console.log(`\n${checks - failures.length}/${checks} checks passed${failures.length ? ', FAILURES:\n- ' + failures.join('\n- ') : ''}`);

  browserWs.close();
  chrome.kill();
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error('SMOKE CRASH:', e); chrome.kill(); process.exit(1); });
