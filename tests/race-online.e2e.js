// Online race on the GitHub Pages version: two browser contexts race over a stand-in for
// Supabase Realtime presence whose shared state lives in this Node process.
// Run: node tests/race-online.e2e.js
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };

const rooms = {};
function realtime(op, a) {
  const r = rooms[a.name] = rooms[a.name] || {};
  if (op === 'track') r[a.key] = [Object.assign({ presence_ref: 'x' }, a.p)];
  if (op === 'untrack') delete r[a.key];
  return r;
}
const STUB = `window.supabase={createClient(){return{
  auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};}},
  from(){return{};},
  channel(name,opts){let state={},last='',live=true;const hs=[];
    const poll=async()=>{if(!live)return;const st=await window.__rt('state',{name});const js=JSON.stringify(st);if(js!==last){last=js;state=st;hs.forEach(h=>h());}setTimeout(poll,60);};
    const ch={on(t,f,cb){hs.push(cb);return ch;},subscribe(cb){setTimeout(()=>{cb('SUBSCRIBED');poll();},10);return ch;},presenceState(){return state;},
      track:async p=>{await window.__rt('track',{name,key:opts.config.presence.key,p});return 'ok';},
      untrack:async()=>{live=false;await window.__rt('untrack',{name,key:opts.config.presence.key});}};
    return ch;},
  removeChannel:async()=>{}};}};`;

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const player = async (nick, dev) => {
    const ctx = await browser.newContext(dev || { viewport: { width: 1280, height: 800 } });
    await ctx.exposeFunction('__rt', (op, a) => realtime(op, a));
    await ctx.route('**/supabase.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
    await ctx.addInitScript(n => localStorage.setItem('borderdesk.v1', JSON.stringify({ tutorialDone: true, nick: n })), nick);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url);
    return { ctx, page, errs };
  };
  const answer = (page) => page.evaluate(() => { const t = window.__BD.desks[0].t; return !t.issues.length ? 'a' : t.crime ? 'x' : 'd'; });
  const ready = (page) => page.waitForFunction(() => { const d = window.__BD.desks[0]; return d && d.t && !d.busy && !d.done && document.getElementById('overlay').hidden; }, null, { timeout: 15000 });

  const A = await player('Ana');
  const B = await player('Ben', devices['Pixel 7']);
  await A.page.click('#btn-race-online');
  await A.page.waitForSelector('#o-create');
  await A.page.click('#o-create');
  await A.page.waitForSelector('.code');
  const code = (await A.page.textContent('.code')).trim();
  ok(/^[A-Z]{4}$/.test(code), 'host: race code ' + code);
  ok(/Race → Online/.test(await A.page.textContent('#overlay')), 'host: tells friends how to join on the Pages version');

  await B.page.tap('#btn-race-online');
  await B.page.waitForSelector('#code');
  await B.page.fill('#code', code.toLowerCase());
  await B.page.tap('#o-join');
  await B.page.waitForFunction(() => /Ana/.test(document.getElementById('overlay').textContent) && /Waiting for Ana/.test(document.getElementById('overlay').textContent), null, { timeout: 8000 });
  ok(true, 'guest: joins the lobby and waits for the host');
  await A.page.waitForFunction(() => /Ben/.test(document.getElementById('overlay').textContent), null, { timeout: 8000 });
  ok(true, 'host: sees the guest join');

  await A.page.click('[data-c="8"]');
  await A.page.click('#o-start');
  await ready(A.page); await ready(B.page);
  ok(await A.page.evaluate(() => JSON.stringify(window.__BD.desks[0].t.docs)) === await B.page.evaluate(() => JSON.stringify(window.__BD.desks[0].t.docs)), 'race: both players get the same traveler');
  await A.page.waitForFunction(() => document.querySelectorAll('.race-strip .racer').length === 2, null, { timeout: 5000 }).catch(() => {});
  ok(await A.page.locator('.race-strip .racer').count() === 2, 'race: live progress shows both racers');
  for (let i = 0; i < 8; i++) {
    await ready(A.page); await A.page.keyboard.press(await answer(A.page));
    await ready(B.page); const k = await answer(B.page); await B.page.tap({ a: '.approve', d: '.deny', x: '.detain' }[k]);
  }
  for (const P of [A, B]) await P.page.waitForFunction(() => /Race results/.test(document.getElementById('overlay').textContent) && document.querySelectorAll('#overlay .item').length === 2 && !/racing/.test(document.getElementById('overlay').textContent), null, { timeout: 15000 });
  ok(true, 'results: both players see both finished times');
  const order = await A.page.$$eval('#overlay .item b:first-child', els => els.map(e => e.textContent));
  ok(order.length === 2 && order.includes('Ana') && order.includes('Ben'), 'results: ranking ' + order.join(', '));
  await A.page.click('#o-leave');
  await A.page.waitForTimeout(300);
  ok(!Object.keys(rooms['border-desk-race-' + code.toLowerCase()] || {}).some(k => (rooms['border-desk-race-' + code.toLowerCase()][k][0] || {}).name === 'Ana'), 'leave: host removed from the room');
  ok(A.errs.length + B.errs.length === 0, 'no page errors ' + A.errs.concat(B.errs).join(' | '));
  await A.ctx.close(); await B.ctx.close();
  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
