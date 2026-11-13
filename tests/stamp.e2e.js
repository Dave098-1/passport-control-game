// Settings → "Stamp it yourself": pick up a stamp, tap the passport, see the imprint.
// Run: node tests/stamp.e2e.js [screenshot-dir]
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ready = page => page.waitForFunction(() => { const d = window.__BD.desks[0]; return d && d.t && !d.busy && !d.done && document.getElementById('overlay').hidden; }, null, { timeout: 15000 });
  const processed = page => page.evaluate(() => window.__BD.desks[0].processed);

  for (const [name, dev] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', devices['Pixel 7']]]) {
    const ctx = await browser.newContext(dev);
    await ctx.addInitScript(() => { if (!localStorage.getItem('borderdesk.v1')) localStorage.setItem('borderdesk.v1', JSON.stringify({ tutorialDone: true })); });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url);
    // Turn the setting on from the menu.
    await page.click('#btn-settings');
    ok(/Stamp it yourself/.test(await page.textContent('#overlay')), `${name}: Settings shows "Stamp it yourself"`);
    await page.click('#set-stamp');
    ok(await page.evaluate(() => window.__BD.SV.manualStamp === true) && (await page.textContent('#set-stamp')) === 'On', `${name}: setting turned on and saved`);
    await page.click('#set-done');
    await page.click('[data-day="1"]');
    await ready(page);
    // Picking up the stamp doesn't decide yet.
    await page.click('.approve');
    ok(await processed(page) === 0 && await page.isVisible('.stamp-hint') && /ENTRY GRANTED/.test(await page.textContent('.stamp-hint')), `${name}: Approve picks up the stamp and asks for the passport`);
    // Tapping the same button puts it down; another button swaps.
    await page.click('.approve');
    ok(!(await page.isVisible('.stamp-hint')), `${name}: tapping again puts the stamp down`);
    const right = await page.evaluate(() => { const t = window.__BD.desks[0].t; return !t.issues.length ? 'approve' : t.crime ? 'detain' : 'deny'; });
    await page.click('.' + right);
    const box = await page.locator('.doc.passport').boundingBox();
    const px = box.x + box.width * 0.7, py = box.y + box.height * 0.6;
    await page.mouse.click(px, py);
    await page.waitForSelector('.imprint');
    const imp = await page.locator('.imprint').boundingBox();
    const cx = imp.x + imp.width / 2, cy = imp.y + imp.height / 2;
    ok(Math.abs(cx - px) < 12 && Math.abs(cy - py) < 12, `${name}: imprint lands where the passport was tapped`);
    if (shots) await page.screenshot({ path: path.join(shots, `stamp-${name}.png`) });
    await page.waitForFunction(() => window.__BD.desks[0].processed === 1);
    ok(await page.evaluate(() => window.__BD.desks[0].correct) === 1, `${name}: the stamp counts as the decision`);
    ok(!(await page.isVisible('.stamp')), `${name}: no big centre stamp in manual mode`);
    // Keyboard stamps straight away with an imprint.
    if (name === 'desktop') {
      await ready(page);
      await page.keyboard.press('d');
      await page.waitForSelector('.imprint');
      await page.waitForFunction(() => window.__BD.desks[0].processed === 2);
      ok(true, 'desktop: keyboard D stamps the passport straight away');
    }
    ok(errs.length === 0, `${name}: no errors ` + errs.join(' | '));
    // Turning it off brings back instant stamping.
    await page.evaluate(() => { window.__BD.SV.manualStamp = false; });
    await ready(page);
    const before = await processed(page);
    await page.click('.approve');
    await page.waitForFunction(b => window.__BD.desks[0].processed === b + 1, before, { timeout: 3000 }).catch(() => {});
    ok(await processed(page) === before + 1, `${name}: with the setting off, stamping is instant again`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
