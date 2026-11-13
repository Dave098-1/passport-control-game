// Browser checks with Playwright: desktop play, iOS gate variants, Home Screen launch, Android layout.
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  const errorsOf = page => { const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && !/fonts|ERR_|404/.test(m.text()) && errs.push(m.text())); return errs; };

  // 1. Desktop: menu -> arcade -> decisions -> inspect -> summary
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => localStorage.setItem('borderdesk.v1', JSON.stringify({ seenHow: true })));
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    ok(await page.isVisible('#menu'), 'desktop: menu visible');
    ok(!(await page.isVisible('#gate')), 'desktop: no gate');
    await shot(page, 'desktop-menu');
    await page.click('[data-day="1"]');
    ok(await page.isVisible('#game'), 'desktop: game started');
    await page.waitForTimeout(400);
    await shot(page, 'desktop-game');
    // Make a correct decision using the engine's truth, then a wrong one.
    let st = await page.evaluate(() => window.__BD_STATE.t.issues.length);
    await page.keyboard.press(st ? 'd' : 'a');
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__BD_STATE.correct) === 1, 'desktop: correct decision counted');
    st = await page.evaluate(() => window.__BD_STATE.t.issues.length);
    await page.click(st ? '#btn-approve' : '#btn-deny');
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__BD_STATE.cites) === 1, 'desktop: wrong decision gives a citation');
    // Inspect: find a traveler with an issue and flag its two fields.
    for (let i = 0; i < 30; i++) {
      const fields = await page.evaluate(() => { const t = window.__BD_STATE.t; return t.issues[0] && t.issues[0].fields; });
      if (fields) {
        await page.click('#btn-inspect');
        for (const k of fields) await page.click(`#game [data-key="${k}"]`);
        await page.waitForTimeout(200);
        ok(await page.evaluate(() => window.__BD_STATE.t.flagged.length) === 1, 'desktop: inspect flags discrepancy ' + fields.join(' + '));
        await shot(page, 'desktop-inspect');
        break;
      }
      await page.keyboard.press('a'); await page.waitForTimeout(1400);
    }
    await page.evaluate(() => { window.__BD_STATE.time = 0.3; });
    await page.waitForTimeout(1600);
    ok(await page.isVisible('#overlay') && /Shift over/.test(await page.textContent('#overlay')), 'desktop: shift summary shown');
    await shot(page, 'desktop-summary');
    ok(errs.length === 0, 'desktop: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  // 2. iOS gate variants
  const gateCase = async (name, opts, expect) => {
    const ctx = await browser.newContext(opts);
    if (opts.__init) await ctx.addInitScript(opts.__init);
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    const gate = await page.isVisible('#gate');
    const menu = await page.isVisible('#menu');
    if (expect === 'game') ok(!gate && menu, `${name}: game opens`);
    else {
      ok(gate && !menu, `${name}: gate blocks game`);
      const txt = await page.textContent('#gate-steps');
      ok(expect.test(txt), `${name}: correct instructions`);
      const arrow = await page.getAttribute('#gate-arrow', 'class');
      ok(/arrow/.test(arrow), `${name}: arrow ${arrow}`);
    }
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

  // 3. iPhone standalone + Android: portrait layout plays, no horizontal page scroll, drawer works
  for (const [name, dev, init] of [['iphone-play', { ...devices['iPhone 15'], userAgent: UAS.iphoneSafari }, () => Object.defineProperty(navigator, 'standalone', { get: () => true })],
                                   ['android-play', devices['Pixel 7'], null]]) {
    const ctx = await browser.newContext(dev);
    await ctx.addInitScript(() => localStorage.setItem('borderdesk.v1', JSON.stringify({ seenHow: true, arcadeMax: 8 })));
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    ok(await page.isVisible('#menu'), `${name}: menu`);
    await shot(page, name + '-menu');
    await page.tap('[data-day="8"]');
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(sw[0] <= sw[1], `${name}: no horizontal page scroll ${sw}`);
    await shot(page, name + '-game');
    await page.tap('#btn-book'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.getElementById('book').classList.contains('open')), `${name}: rulebook drawer opens`);
    await shot(page, name + '-rules');
    await page.tap('#book-close'); await page.waitForTimeout(300);
    await page.tap('#btn-approve'); await page.waitForTimeout(1500);
    ok(await page.evaluate(() => window.__BD_STATE.processed) === 1, `${name}: tap stamp works`);
    ok(errs.length === 0, `${name}: no console errors ` + errs.join(' | '));
    await ctx.close();
  }

  // 4. Story: play through day 1 intro and a full day, and day 5 bribe choice
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { if (!localStorage.getItem('borderdesk.v1')) localStorage.setItem('borderdesk.v1', JSON.stringify({ seenHow: true })); });
    const page = await ctx.newPage(); const errs = errorsOf(page);
    await page.goto(url);
    await page.click('#st-new');
    while (await page.isVisible('#ov-next')) await page.click('#ov-next');
    ok(await page.evaluate(() => window.__BD_STATE.mode === 'story'), 'story: day 1 started after intro');
    for (let i = 0; i < 8; i++) {
      const bad = await page.evaluate(() => window.__BD_STATE.t.issues.length);
      await page.keyboard.press(bad ? 'd' : 'a'); await page.waitForTimeout(1400);
    }
    ok(/End of day 1/.test(await page.textContent('#overlay')), 'story: end of day 1 summary');
    await shot(page, 'story-day-end');
    // jump to day 5 to test the bribe choice
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('borderdesk.v1')); s.story.day = 5; localStorage.setItem('borderdesk.v1', JSON.stringify(s)); });
    await page.reload();
    await page.click('#st-cont');
    while (await page.isVisible('#ov-next')) await page.click('#ov-next');
    for (let i = 0; i < 4; i++) { await page.keyboard.press('a'); await page.waitForTimeout(1400); }
    await page.waitForTimeout(900);
    ok(/50 crowns/.test(await page.textContent('#overlay')), 'story: bribe choice appears on day 5');
    await shot(page, 'story-bribe');
    await page.click('#overlay [data-k="0"]');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('borderdesk.v1')).story.flags.bribes) === 1, 'story: bribe recorded');
    ok(errs.length === 0, 'story: no console errors ' + errs.join(' | '));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
