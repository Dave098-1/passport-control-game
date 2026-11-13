// Chapter 2 (days 11-20): starting it, the bag check with a smuggler, the wanted list, and the ending.
// Run: node tests/chapter2.e2e.js [screenshot-dir]
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const shots = process.argv[2];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const TIPS = Object.fromEntries(['city', 'ticket', 'names', 'workpass', 'seal', 'banned', 'vaccine', 'idcard', 'stay', 'height', 'fingerprint', 'transit', 'diplomat', 'consent', 'idexpiry', 'sponsor', 'contraband', 'declaration', 'wanted', 'signature'].map(k => [k, 1]));

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const open = async (state, dev) => {
    const ctx = await browser.newContext(dev || { viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(s => { if (!localStorage.getItem('borderdesk.v1')) localStorage.setItem('borderdesk.v1', s); }, JSON.stringify(state));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url);
    return { ctx, page, errs };
  };
  const ready = page => page.waitForFunction(() => { const d = window.__BD.desks[0]; return d && d.t && !d.busy && !d.done && document.getElementById('overlay').hidden; }, null, { timeout: 15000 });
  const right = page => page.evaluate(() => { const t = window.__BD.desks[0].t; return !t.issues.length ? 'a' : t.crime ? 'x' : 'd'; });
  const intro = async page => { while (await page.isVisible('#ov-next')) await page.click('#ov-next'); };
  const playUntil = async (page, name) => {
    for (let i = 0; i < 30; i++) {
      // wait until either the named traveler is at the window or the desk is ready for a decision
      await page.waitForFunction(n => { const d = window.__BD.desks[0]; if (!d || !d.t || d.done) return false;
        return d.t.name === n || (!d.busy && document.getElementById('overlay').hidden); }, name, { timeout: 15000 });
      if (await page.evaluate(n => window.__BD.desks[0].t.name === n, name)) return true;
      await page.keyboard.press(await right(page));
      await page.waitForFunction(() => window.__BD.desks[0].busy, null, { timeout: 5000 }).catch(() => {});
    }
    return false;
  };

  // 1. After chapter 1, the menu offers chapter 2, which starts on day 11 with chapter-1 choices carried over.
  {
    const { ctx, page, errs } = await open({ tutorialDone: true, tips: TIPS, storyCh1: { flags: { mercy: 1, bribes: 0, reported: true, anni: 'in', mara: true, fennCaught: false }, pay: 300, cites: 4, ending: 'Open Door' } });
    ok(/Chapter 2: the Northern Pass/.test(await page.textContent('#story-btns')), 'menu: offers chapter 2 after chapter 1');
    await page.click('#st-ch2');
    ok(/Chief Holt/.test(await page.textContent('#overlay')), 'chapter 2: Chief Holt briefs day 11');
    await intro(page); await ready(page);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('borderdesk.v1')).story);
    ok(st.day === 11 && st.flags.anni === 'in' && st.flags.reported === true && st.flags.bribes2 === 0, 'chapter 2: day 11, chapter-1 choices kept');
    ok(await page.evaluate(() => window.__BD.desks[0].queue.length) === 15, 'chapter 2: 15 travelers on day 11');
    ok(errs.length === 0, 'chapter 2 start: no errors ' + errs.join(' | '));
    await ctx.close();
  }
  // 2. Day 17 on a phone: Mara's request, the bag check, and detaining the smuggler.
  {
    const story = { day: 17, seed: 99, flags: { mercy: 0, bribes: 0, reported: false, anni: null, mara: false, fennCaught: false, ring: false, ringPlan: false, bribes2: 0, mercy2: 0, edda: null }, pay: 0, cites: 0, chapter: 2 };
    const ctx2 = await browser.newContext(devices['Pixel 7']);
    await ctx2.addInitScript(s => { if (!localStorage.getItem('borderdesk.v1')) localStorage.setItem('borderdesk.v1', s); }, JSON.stringify({ tutorialDone: true, tips: TIPS, story }));
    const p = await ctx2.newPage(); const e2 = []; p.on('pageerror', e => e2.push(e.message));
    await p.goto(url);
    await p.tap('#st-cont'); await intro(p);
    ok(await p.evaluate(() => window.__BD.desks[0].c.contraband.includes('seeds')), 'day 17: banned goods list in effect');
    ok(await playUntil(p, 'Oskar Brandt'), 'day 17: the courier arrives');
    await p.waitForFunction(() => /Mara/.test(document.getElementById('overlay').textContent), null, { timeout: 5000 });
    ok(true, 'day 17: Mara asks to let the courier through');
    await p.tap('#overlay [data-k="1"]'); // by the book
    await ready(p);
    await p.tap('.ask-btn'); await p.tap('[data-q="bag"]');
    const bag = await p.textContent('.bag-scan');
    ok(/seeds/.test(bag), 'day 17: bag scan shows the banned seeds: ' + bag.trim());
    if (shots) await p.screenshot({ path: path.join(shots, 'ch2-bag-phone.png') });
    await p.tap('.detain'); await p.waitForTimeout(300);
    ok(/Detained/.test(await p.textContent('.toast')), 'day 17: detaining the smuggler is correct');
    ok(e2.length === 0, 'day 17: no errors ' + e2.join(' | '));
    await ctx2.close();
  }
  // 3. Day 19 on desktop: wanted posters in the rulebook; Edda is on the list.
  {
    const story = { day: 19, seed: 7, flags: { mercy: 0, bribes: 0, reported: false, anni: null, mara: false, fennCaught: true, ring: true, ringPlan: true, bribes2: 0, mercy2: 0, edda: null }, pay: 0, cites: 0, chapter: 2 };
    const { ctx, page, errs } = await open({ tutorialDone: true, tips: TIPS, story });
    await page.click('#st-cont'); await intro(page); await ready(page);
    ok(await page.locator('#book .poster').count() === 2 && /Edda Varga/.test(await page.textContent('#book')), 'day 19: two wanted posters in the rulebook');
    if (shots) await page.screenshot({ path: path.join(shots, 'ch2-wanted-desktop.png') });
    ok(await playUntil(page, 'Edda Varga'), 'day 19: Edda arrives');
    ok(await page.evaluate(() => window.__BD.desks[0].t.crime && window.__BD.desks[0].t.issues.some(i => i.rule === 'wanted')), 'day 19: Edda is flagged as wanted');
    await ready(page); await page.keyboard.press('x');
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('borderdesk.v1')).story.flags.edda) === 'held', 'day 19: detaining Edda is remembered');
    ok(errs.length === 0, 'day 19: no errors ' + errs.join(' | '));
    await ctx.close();
  }
  // 4. Day 20 finishes chapter 2 with an ending that uses the ring flag.
  {
    const story = { day: 20, seed: 3, flags: { mercy: 0, bribes: 0, reported: false, anni: null, mara: false, fennCaught: true, ring: true, ringPlan: true, bribes2: 0, mercy2: 0, edda: 'in' }, pay: 0, cites: 0, chapter: 2 };
    const { ctx, page, errs } = await open({ tutorialDone: true, tips: TIPS, story });
    await page.click('#st-cont'); await intro(page);
    const n = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); return window.__BD.desks[0].queue.length; });
    for (let i = 0; i < n; i++) { await ready(page); await page.keyboard.press(await right(page)); }
    await page.waitForFunction(() => /Chapter 2 ending/.test(document.getElementById('overlay').textContent), null, { timeout: 15000 });
    ok(/The Ring Breaks/.test(await page.textContent('#overlay')), 'ending: The Ring Breaks');
    await page.click('#o3');
    ok(/Replay chapter 2/.test(await page.textContent('#story-btns')), 'menu: chapter 2 can be replayed');
    ok(errs.length === 0, 'ending: no errors ' + errs.join(' | '));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
