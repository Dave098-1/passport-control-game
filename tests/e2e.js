// Browser checks with Playwright: solo modes, new tools, tutorial, races, iOS gate, phone layouts.
// Run: node tests/e2e.js [screenshot-dir]
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const shots = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const UAS = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneInsta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  ipadDesktopUA: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const save = obj => `if (!localStorage.getItem('borderdesk.v1')) localStorage.setItem('borderdesk.v1', ${JSON.stringify(JSON.stringify(obj))});`;

// The right call for desk i's current traveler, using the engine's own verdict.
const answer = (page, i = 0) => page.evaluate(i => { const t = window.__BD.desks[i].t; return !t.issues.length ? 'approve' : t.crime ? 'detain' : 'deny'; }, i);
const ready = (page, i = 0) => page.waitForFunction(i => { const d = window.__BD.desks[i]; return d && d.t && !d.busy && !d.done && document.getElementById('overlay').hidden; }, i, { timeout: 15000 });
const KEY = { approve: 'a', deny: 'd', detain: 'x' }, KEY2 = { approve: 'ArrowRight', deny: 'ArrowLeft', detain: 'ArrowDown' };
async function playRight(page, i = 0, keys = KEY) { await ready(page, i); await page.keyboard.press(keys[await answer(page, i)]); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  const errorsOf = page => { const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && !/fonts|ERR_|404/.test(m.text()) && errs.push(m.text())); return errs; };
  const desktop = async (state, extra) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(extra || {}) });
    await ctx.addInitScript(save(state));
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    return { ctx, page, errs };
  };

  // 1. Desktop arcade: decisions, detain, inspect, drag, shift end, crowns
  {
    const { ctx, page, errs } = await desktop({ tutorialDone: true, seenHow: true, tips: { city: 1, ticket: 1 } });
    ok(await page.isVisible('#menu'), 'desktop: menu visible');
    await shot(page, 'desktop-menu');
    await page.click('[data-day="1"]');
    await ready(page);
    await shot(page, 'desktop-game');
    await playRight(page);
    await page.waitForFunction(() => window.__BD.desks[0].processed === 1);
    ok(await page.evaluate(() => window.__BD.desks[0].correct) === 1, 'desktop: correct decision counted');
    await ready(page);
    const a = await answer(page);
    await page.keyboard.press(a === 'approve' ? 'd' : 'a');
    await page.waitForFunction(() => window.__BD.desks[0].processed === 2);
    ok(await page.evaluate(() => window.__BD.desks[0].cites) === 1, 'desktop: wrong decision gives a citation');
    // Detain a crime + inspect flag + drag
    let detained = false, wrongDetain = false, flagged = false, dragged = false;
    for (let i = 0; i < 40 && !(detained && wrongDetain && flagged && dragged); i++) {
      await ready(page);
      const info = await page.evaluate(() => { const t = window.__BD.desks[0].t; return { n: t.issues.length, crime: t.crime, fields: t.issues[0] && t.issues[0].fields }; });
      if (!dragged) {
        const box = await page.locator('.doc.passport header').boundingBox();
        await page.mouse.move(box.x + 30, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 230, box.y + 150, { steps: 6 }); await page.mouse.up();
        const nb = await page.locator('.doc.passport header').boundingBox();
        dragged = Math.abs(nb.x - box.x - 200) < 3 && Math.abs(nb.y - box.y - 140) < 3;
        ok(dragged, 'desktop: passport dragged by its header');
      }
      if (info.n && !flagged) {
        await page.click('.act-inspect');
        for (const k of info.fields) {
          if (k === 'answer.stay' || k === 'booth.print') continue;
          await page.click(`[data-key="${k}"]`);
        }
        await page.waitForTimeout(150);
        flagged = await page.evaluate(() => window.__BD.desks[0].t.flagged.length) === 1;
        ok(flagged, 'desktop: inspect flags ' + info.fields.join(' + '));
        await shot(page, 'desktop-inspect');
      }
      if (info.crime && !detained) { await page.click('.detain'); detained = true; await page.waitForTimeout(300); ok(/Detained/.test(await page.textContent('.toast')), 'desktop: detaining a criminal is correct'); continue; }
      if (info.n && !info.crime && !wrongDetain) { await page.click('.detain'); wrongDetain = true; await page.waitForTimeout(300); ok(/wrongful detention/i.test(await page.textContent('.toast')), 'desktop: detaining a non-criminal is a citation'); continue; }
      await page.keyboard.press(KEY[await answer(page)]);
    }
    ok(detained && wrongDetain, 'desktop: both detain cases seen');
    await page.evaluate(() => { window.__BD.desks[0].time = 0.3; });
    await page.waitForSelector('#overlay:not([hidden])', { timeout: 8000 });
    ok(/Shift over/.test(await page.textContent('#overlay')) && /crowns/.test(await page.textContent('#overlay')), 'desktop: shift summary with crowns');
    ok(await page.evaluate(() => window.__BD.SV.crowns) >= 0, 'desktop: wallet saved');
    await shot(page, 'desktop-summary');
    ok(errs.length === 0, 'desktop: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  // 2. Shop + UV lamp + event banner + Ask (stay) on day 11
  {
    const { ctx, page, errs } = await desktop({ tutorialDone: true, crowns: 500, arcadeMax: 14, tips: Object.fromEntries(['city','ticket','names','workpass','seal','banned','vaccine','idcard','stay','height','fingerprint'].map(k => [k, 1])) });
    await page.click('#btn-shop');
    await page.click('[data-buy="uv"]');
    ok(await page.evaluate(() => window.__BD.SV.upgrades.uv === true && window.__BD.SV.crowns === 350), 'shop: UV lamp bought for 150');
    await shot(page, 'shop');
    await page.click('#shop-close');
    await page.evaluate(() => window.__BD.startArcade(11, { event: 'power' }));
    ok(/Power cut/.test(await page.textContent('#overlay')), 'event: power cut banner shown');
    await page.click('#ov-go');
    await ready(page);
    ok(await page.isVisible('.act-uv'), 'shop: UV button appears in game');
    ok(await page.evaluate(() => document.querySelector('.desk').classList.contains('dark')), 'event: desk is dark');
    await page.click('.act-uv');
    ok(await page.evaluate(() => !document.querySelector('.desk').classList.contains('dark')), 'UV lamp lights the dark desk');
    let asked = false, printed = false, lined = false;
    for (let i = 0; i < 40 && !(asked && printed && lined); i++) {
      await ready(page);
      if (!lined && await page.isVisible('.lineup')) {
        const box = await page.locator('.doc.passport header').boundingBox();
        await page.mouse.move(box.x + 30, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 130, box.y + 260, { steps: 5 }); await page.mouse.up();
        await page.click('.lineup');
        const ys = await page.$$eval('.docs .doc', els => els.map(e => e.offsetTop).filter(t => t === 0).length);
        lined = ys >= 2; ok(lined, 'drag: Line up puts two documents side by side at the top');
      }
      const has = await page.evaluate(() => ({ ticket: !!window.__BD.desks[0].t.docs.ticket, work: !!window.__BD.desks[0].t.docs.work }));
      if (has.ticket && !asked) {
        await page.click('.ask-btn'); await page.click('[data-q="stay"]');
        asked = await page.isVisible('[data-key="answer.stay"]');
        ok(asked, 'ask: stay answer appears as a tappable field');
      }
      if (has.work && !printed) {
        if (!(await page.isVisible('.ask-menu'))) await page.click('.ask-btn');
        await page.click('[data-q="print"]');
        printed = await page.isVisible('[data-key="booth.print"]');
        ok(printed, 'ask: fingerprint card appears');
        await shot(page, 'ask-uv');
      }
      await page.keyboard.press(KEY[await answer(page)]);
    }
    ok(errs.length === 0, 'shop/ask: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  // 3. Guided tutorial with real clicks
  {
    const { ctx, page, errs } = await desktop({});
    await page.click('#btn-tutorial');
    await page.waitForSelector('#coach:not([hidden])');
    await shot(page, 'tutorial');
    const step = async () => {
      for (let i = 0; i < 6; i++) { if (await page.isVisible('#coach-next')) { const txt = await page.textContent('#coach-next'); await page.click('#coach-next'); if (txt === 'Done') return; await page.waitForTimeout(120); } else return; }
    };
    await step(); // face, photo, expiry, date, rulebook
    await page.click('.approve'); await page.waitForTimeout(2200);
    await page.click('.deny'); await page.waitForTimeout(2200);
    await page.click('.act-inspect'); await page.waitForTimeout(200);
    await page.click('[data-key="passport.photo"]'); await page.waitForTimeout(200);
    await page.click('.face-btn'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__BD.desks[0].t.flagged.length === 1), 'tutorial: impostor flagged');
    await page.click('.detain'); await page.waitForTimeout(2200);
    ok(await page.isVisible('#coach-next'), 'tutorial: final step shown');
    await page.click('#coach-next');
    ok(await page.isVisible('#menu') && await page.evaluate(() => window.__BD.SV.tutorialDone), 'tutorial: finished and saved');
    ok(await page.evaluate(() => window.__BD.SV.crowns === 0), 'tutorial: no crowns from training');
    ok(errs.length === 0, 'tutorial: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  // 4. Split-screen race (2 players, same travelers)
  {
    const { ctx, page, errs } = await desktop({ tutorialDone: true, raceCfg: { players: 2, names: ['Ana', 'Ben', 'C', 'D', 'E', 'F'], count: 8, day: 10 } });
    await page.click('#btn-race-local');
    ok(/Split screen/.test(await page.textContent('#overlay')), 'split race: offered on a wide screen');
    await page.click('#race-go');
    await ready(page, 0); await ready(page, 1);
    ok(await page.evaluate(() => JSON.stringify(window.__BD.desks[0].t.docs) === JSON.stringify(window.__BD.desks[1].t.docs)), 'split race: both players get the same traveler');
    await shot(page, 'race-split');
    for (let i = 0; i < 8; i++) { await playRight(page, 0, KEY); await playRight(page, 1, KEY2); }
    await page.waitForFunction(() => /Race results/.test(document.getElementById('overlay').textContent), null, { timeout: 15000 });
    ok(await page.locator('#overlay .item').count() === 2, 'split race: results for both players');
    await shot(page, 'race-results');
    ok(errs.length === 0, 'split race: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  // 5. Pass-and-play on a phone (3 players), penalties change the ranking
  {
    const ctx = await browser.newContext(devices['Pixel 7']);
    await ctx.addInitScript(save({ tutorialDone: true, raceCfg: { players: 3, names: ['Ana', 'Ben', 'Cy', 'D', 'E', 'F'], count: 8, day: 3 } }));
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    await page.tap('#btn-race-local');
    ok(/Pass and play/.test(await page.textContent('#overlay')), 'pass race: phones get pass-and-play');
    await page.tap('#race-go');
    for (let p = 0; p < 3; p++) {
      await page.tap('#o1');
      for (let i = 0; i < 8; i++) {
        await ready(page);
        let a = await answer(page);
        if (p === 0 && i < 3) a = a === 'approve' ? 'deny' : 'approve'; // Ana makes 3 mistakes (+30 s)
        await page.tap('.' + a);
      }
      await page.waitForSelector('#overlay:not([hidden]) #o1');
      if (p < 2) await page.tap('#o1');
    }
    await page.tap('#o1');
    await page.waitForFunction(() => /Race results/.test(document.getElementById('overlay').textContent));
    const names = await page.$$eval('#overlay .item b:first-child', els => els.map(e => e.textContent));
    ok(names.length === 3 && names[2] === 'Ana', 'pass race: mistakes push Ana to last ' + names.join(','));
    await shot(page, 'race-pass-results');
    ok(errs.length === 0, 'pass race: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  // 6. Online race: unavailable without Claude; works with a stand-in room
  {
    const { ctx, page, errs } = await desktop({ tutorialDone: true });
    await page.click('#btn-race-online');
    await page.waitForFunction(() => /internet connection/.test(document.getElementById('overlay').textContent), null, { timeout: 15000 });
    ok(true, 'online: explains it needs a connection when the race server can\u2019t be reached');
    await ctx.close();
    // Stand-in for the artifact's room capability: one local peer, enough to drive host -> race -> results.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx2.addInitScript(save({ tutorialDone: true, nick: 'Tester' }));
    await ctx2.addInitScript(() => {
      const mk = () => { let pres = {}; const subs = []; const me = () => ({ peer: 'p1', by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: pres, updatedAt: Date.now() });
        const fire = () => setTimeout(() => subs.forEach(f => f({ peers: [me()], joined: [], left: [], updated: [] })), 10);
        return { name: 'x', presence: async p => { pres = Object.assign({}, pres, p); fire(); }, peers: () => [me()], onPeers: f => { subs.push(f); fire(); return () => {}; }, leave: async () => {}, emit: async () => {}, on: () => () => {}, connected: () => true, onConnection: () => () => {} }; };
      window.claude = { use: async n => n === 'room' ? { join: async () => mk() } : null };
    });
    const p2 = await ctx2.newPage(); const errs2 = errorsOf(p2);
    await p2.goto(url);
    await p2.click('#btn-race-online');
    await p2.waitForSelector('#o-create');
    await p2.click('#o-create');
    await p2.waitForSelector('#o-start');
    ok(/Tester/.test(await p2.textContent('#overlay')), 'online: lobby lists you');
    await shot(p2, 'online-lobby');
    await p2.click('[data-c="8"]');
    await p2.click('#o-start');
    await ready(p2);
    ok(await p2.isVisible('.race-strip'), 'online: live race strip shown');
    for (let i = 0; i < 8; i++) await playRight(p2);
    await p2.waitForFunction(() => /Race results/.test(document.getElementById('overlay').textContent), null, { timeout: 15000 });
    ok(/Tester/.test(await p2.textContent('#overlay')), 'online: results list the racer');
    await shot(p2, 'online-results');
    ok(errs.length + errs2.length === 0, 'online: no console errors ' + errs.concat(errs2).join(' | '));
    await ctx2.close();
  }

  // 7. Story: day 1 intro, 10+ travelers, then the day-5 bribe
  {
    const { ctx, page, errs } = await desktop({ tutorialDone: true });
    await page.click('#st-new');
    while (await page.isVisible('#ov-next')) await page.click('#ov-next');
    await ready(page);
    ok(await page.evaluate(() => window.__BD.desks[0].queue.length) === 10, 'story: day 1 has 10 travelers');
    for (let i = 0; i < 10; i++) await playRight(page);
    await page.waitForFunction(() => /End of day 1/.test(document.getElementById('overlay').textContent));
    ok(true, 'story: end of day 1 summary');
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('borderdesk.v1')); s.story.day = 5; localStorage.setItem('borderdesk.v1', JSON.stringify(s)); });
    await page.reload();
    await page.click('#st-cont');
    while (await page.isVisible('#ov-next')) await page.click('#ov-next');
    if (await page.isVisible('#coach-next')) await page.click('#coach-next');
    for (let i = 0; i < 4; i++) await playRight(page);
    await page.waitForFunction(() => /50 crowns/.test(document.getElementById('overlay').textContent), null, { timeout: 8000 });
    ok(true, 'story: bribe choice appears on day 5');
    await page.click('#overlay [data-k="1"]');
    await ready(page);
    await page.click('.detain');
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('borderdesk.v1')).story.flags.fennCaught), 'story: detaining Fenn is remembered');
    ok(errs.length === 0, 'story: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  // 8. iOS gate variants
  const gateCase = async (name, opts, expect) => {
    const ctx = await browser.newContext(opts);
    if (opts.__init) await ctx.addInitScript(opts.__init);
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    const gate = await page.isVisible('#gate'), menu = await page.isVisible('#menu');
    if (expect === 'game') ok(!gate && menu, `${name}: game opens`);
    else { ok(gate && !menu, `${name}: gate blocks game`); ok(expect.test(await page.textContent('#gate-steps')), `${name}: correct instructions`); }
    await shot(page, name);
    ok(errs.length === 0, `${name}: no console errors ` + errs.join(' | '));
    await ctx.close();
  };
  await gateCase('iphone-safari', { ...devices['iPhone 15'], userAgent: UAS.iphoneSafari }, /bottom of Safari/);
  await gateCase('iphone-chrome', { ...devices['iPhone 15'], userAgent: UAS.iphoneChrome }, /address bar/);
  await gateCase('iphone-instagram', { ...devices['iPhone 15'], userAgent: UAS.iphoneInsta }, /Open in Safari/);
  await gateCase('ipad-safari', { viewport: { width: 1024, height: 1366 }, hasTouch: true, userAgent: UAS.ipadDesktopUA,
    __init: () => { Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }); Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); } }, /top right/);
  await gateCase('iphone-homescreen', { ...devices['iPhone 15'], userAgent: UAS.iphoneSafari,
    __init: () => { Object.defineProperty(navigator, 'standalone', { get: () => true }); } }, 'game');

  // 9. Phone layouts play by touch
  for (const [name, dev, init] of [['iphone-play', { ...devices['iPhone 15'], userAgent: UAS.iphoneSafari }, () => Object.defineProperty(navigator, 'standalone', { get: () => true })],
                                   ['android-play', devices['Pixel 7'], null]]) {
    const ctx = await browser.newContext(dev);
    await ctx.addInitScript(save({ tutorialDone: true, arcadeMax: 13, upgrades: { uv: true, checklist: true }, tips: Object.fromEntries(['city','ticket','names','workpass','seal','banned','vaccine','idcard','stay','height','fingerprint','transit','diplomat','consent'].map(k => [k, 1])) }));
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    ok(await page.isVisible('#menu'), `${name}: menu`);
    await shot(page, name + '-menu');
    await page.evaluate(() => window.__BD.startArcade(14, { event: null }));
    await ready(page);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(sw[0] <= sw[1], `${name}: no horizontal page scroll ${sw}`);
    const fits = await page.evaluate(() => [...document.querySelectorAll('.actions .act')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().right <= innerWidth + 1));
    ok(fits, `${name}: action buttons fit the screen`);
    await shot(page, name + '-game');
    await page.tap('.act-book'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.getElementById('book').classList.contains('open')), `${name}: rulebook drawer opens`);
    await shot(page, name + '-rules');
    await page.tap('#book-close'); await page.waitForTimeout(300);
    await page.tap('.' + await answer(page)); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__BD.desks[0].processed) === 1, `${name}: tap stamp works`);
    ok(errs.length === 0, `${name}: no console errors ` + errs.join(' | '));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
