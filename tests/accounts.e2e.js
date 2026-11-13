// Account + cross-device save tests. The Supabase library is replaced with a stand-in whose "server"
// lives in this Node process, so two browser contexts act like two devices on one account.
// Run: node tests/accounts.e2e.js
const { chromium } = require('playwright');
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

// ---- fake backend (shared by all contexts) ----
const users = {}; const saves = {}; let calls = 0;
function backend(op, a) {
  calls++;
  if (op === 'signUp') { if (users[a.email]) return { error: 'User already registered' }; users[a.email] = { pw: a.password, id: 'u-' + Object.keys(users).length }; return { user: { id: users[a.email].id, email: a.email } }; }
  if (op === 'signIn') { const u = users[a.email]; if (!u || u.pw !== a.password) return { error: 'Invalid login credentials' }; return { user: { id: u.id, email: a.email } }; }
  if (op === 'google') { if (!a.token || !a.nonce) return { error: 'missing token or nonce' }; const email = 'g@example.com'; users[email] = users[email] || { pw: null, id: 'u-g' }; return { user: { id: users[email].id, email } }; }
  if (op === 'get') return saves[a.uid] || null;
  if (op === 'put') { saves[a.user_id] = { data: a.data, updated_at: a.updated_at }; return {}; }
  if (op === 'del') { delete saves[a.uid]; return {}; }
}
const STUB = `window.supabase={createClient(){
  const LS='sb-gidygwjvmzvlkcmpdmyd-auth-token';let session=JSON.parse(localStorage.getItem(LS)||'null');const subs=[];
  const set=(s,ev)=>{session=s;s?localStorage.setItem(LS,JSON.stringify(s)):localStorage.removeItem(LS);subs.forEach(f=>f(ev,session));};
  const auth={getSession:async()=>({data:{session},error:null}),
    onAuthStateChange(f){subs.push(f);return{data:{subscription:{unsubscribe(){}}}};},
    signUp:async a=>{const r=await window.__sb('signUp',a);if(r.error)return{data:{},error:{message:r.error}};set({user:r.user},'SIGNED_IN');return{data:{user:r.user,session},error:null};},
    signInWithPassword:async a=>{const r=await window.__sb('signIn',a);if(r.error)return{data:{},error:{message:r.error}};set({user:r.user},'SIGNED_IN');return{data:{user:r.user,session},error:null};},
    signInWithIdToken:async a=>{const r=await window.__sb('google',a);if(r.error)return{data:{},error:{message:r.error}};window.__idTokenArgs=a;set({user:r.user},'SIGNED_IN');return{data:{user:r.user,session},error:null};},
    signOut:async()=>{set(null,'SIGNED_OUT');return{error:null};},
    signInWithOAuth:async()=>({error:{message:'Unsupported provider: provider is not enabled'}}),
    resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null})};
  const from=()=>({select(){return this;},eq(){return this;},
    maybeSingle:async()=>({data:await window.__sb('get',{uid:session.user.id}),error:null}),
    upsert:async row=>{await window.__sb('put',row);return{error:null};},
    delete(){return{eq:async()=>{await window.__sb('del',{uid:session.user.id});return{error:null};}};}});
  return{auth,from};}};`;

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const device = async (state) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.exposeFunction('__sb', (op, a) => backend(op, a));
    await ctx.route('**/supabase.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
    if (state) await ctx.addInitScript(s => { if (!localStorage.getItem('borderdesk.v1')) localStorage.setItem('borderdesk.v1', s); }, JSON.stringify(state));
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url);
    return { ctx, page, errs };
  };
  const SV = p => p.evaluate(() => window.__BD.SV);
  const fill = async (p, sel, v) => { await p.fill(sel, v); };

  // Guest play makes no account calls and loads no library.
  {
    const { ctx, page } = await device({ tutorialDone: true });
    ok(await page.textContent('#btn-account') === 'Log in to save across devices', 'guest: menu offers login');
    ok(await page.evaluate(() => !window.supabase), 'guest: login library not loaded until asked');
    await ctx.close();
  }
  // Device A: create account with progress -> save uploaded.
  {
    const { ctx, page, errs } = await device({ tutorialDone: true, crowns: 120, arcadeMax: 3, story: { day: 4, seed: 1, flags: {}, pay: 0, cites: 0 }, sound: false });
    await page.click('#btn-account');
    await page.waitForSelector('#acc-google');
    ok(await page.isVisible('#acc-google') && await page.isVisible('.or'), 'login: Google button and "or" divider shown');
    await page.click('#acc-google-alt'); await page.waitForTimeout(100);
    ok(/isn.t switched on yet/.test(await page.textContent('#acc-err')), 'login: Google not enabled yet gives a clear message');
    await page.click('#acc-switch');
    await fill(page, '#acc-email', 'ana@example.com'); await fill(page, '#acc-pw', 'short'); await fill(page, '#acc-pw2', 'short');
    await page.click('#acc-go');
    ok(/8 characters/.test(await page.textContent('#acc-err')), 'signup: short password rejected');
    await fill(page, '#acc-pw', 'border-desk-1'); await fill(page, '#acc-pw2', 'border-desk-1');
    await page.click('#acc-go');
    await page.waitForFunction(() => window.__BD.Cloud.lastSync > 0);
    ok(saves['u-0'] && saves['u-0'].data.crowns === 120 && saves['u-0'].data.sound === undefined, 'signup: this device’s save uploaded (without device settings)');
    ok(/ana@example\.com/.test(await page.textContent('#btn-account')), 'menu: shows the signed-in email');
    // Earn more crowns -> pushed after the debounce.
    // Spend crowns in the shop -> the change is uploaded after a short pause.
    await page.evaluate(() => { window.__BD.SV.crowns = 380; });
    await page.click('#btn-shop'); await page.click('[data-buy="quick"]'); await page.click('#shop-close');
    await page.waitForTimeout(2600);
    ok(saves['u-0'].data.crowns === 300 && saves['u-0'].data.upgrades.quick === true, 'sync: shop purchase uploaded automatically');
    ok(errs.length === 0, 'device A: no errors ' + errs.join(' | '));
    await ctx.close();
  }
  // Device B with its own progress: login asks which save to keep; pick cloud.
  {
    const { ctx, page, errs } = await device({ tutorialDone: true, crowns: 15, arcadeMax: 1, sound: true });
    await page.click('#btn-account');
    await page.waitForSelector('#acc-email');
    await fill(page, '#acc-email', 'ana@example.com'); await fill(page, '#acc-pw', 'wrong-password');
    await page.click('#acc-go'); await page.waitForTimeout(100);
    ok(/Wrong email or password/.test(await page.textContent('#acc-err')), 'login: wrong password message');
    await fill(page, '#acc-pw', 'border-desk-1'); await page.click('#acc-go');
    await page.waitForSelector('#pick-cloud');
    ok(/Story day 4/.test(await page.textContent('#pick-cloud')) && /15 crowns/.test(await page.textContent('#pick-local')), 'device B: asks cloud vs this device with summaries');
    await page.click('#pick-cloud');
    const s = await SV(page);
    ok(s.crowns === 300 && s.story && s.story.day === 4 && s.sound === true, 'device B: cloud save applied, own sound setting kept');
    ok(/300 crowns/.test(await page.textContent('#menu-wallet')), 'device B: menu shows synced wallet');
    // Reload: session restored, newer cloud save wins automatically without asking.
    saves['u-0'].data.crowns = 999; saves['u-0'].updated_at = new Date(Date.now() + 60000).toISOString();
    await page.reload();
    await page.waitForFunction(() => window.__BD.SV.crowns === 999, null, { timeout: 5000 }).catch(() => {});
    ok((await SV(page)).crowns === 999 && !(await page.isVisible('#pick-cloud')), 'restart: newer cloud save wins without asking');
    // Log out keeps local progress.
    await page.click('#btn-account'); await page.click('#acc-out');
    ok((await SV(page)).crowns === 999 && await page.textContent('#btn-account') === 'Log in to save across devices', 'logout: local progress kept');
    ok(errs.length === 0, 'device B: no errors ' + errs.join(' | '));
    await ctx.close();
  }
  // Fresh device: logs in and simply takes the cloud save (nothing to choose).
  {
    const { ctx, page } = await device({ tutorialDone: true });
    await page.click('#btn-account'); await page.waitForSelector('#acc-email');
    await fill(page, '#acc-email', 'ana@example.com'); await fill(page, '#acc-pw', 'border-desk-1'); await page.click('#acc-go');
    await page.waitForFunction(() => window.__BD.SV.crowns === 999, null, { timeout: 5000 }).catch(() => {});
    ok((await SV(page)).crowns === 999 && !(await page.isVisible('#pick-cloud')), 'fresh device: cloud save loaded without a question');
    await ctx.close();
  }
  // Google's own pop-up (Google Identity Services) when a Client ID is set.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.exposeFunction('__sb', (op, a) => backend(op, a));
    await ctx.route('**/supabase.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
    await ctx.route('**/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{id:{initialize(o){window.__gsi=o;},renderButton(el,opt){window.__gsiOpt=opt;el.innerHTML='<div><button id="gsi-btn" type="button" style="width:'+opt.width+'px;height:40px;display:block">Sign in with Google</button></div>';el.querySelector('button').onclick=()=>window.__gsi.callback({credential:'header.payload.sig'});}}}};` }));
    await ctx.addInitScript(() => { window.__TEST_GOOGLE_ID = 'test-client.apps.googleusercontent.com'; localStorage.setItem('borderdesk.v1', JSON.stringify({ tutorialDone: true })); });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url);
    await page.click('#btn-account');
    await page.waitForSelector('#gsi-btn');
    ok(await page.isVisible('#acc-google') && /Login with Google/.test(await page.textContent('#acc-google')) && await page.isVisible('#acc-google-alt'), 'google pop-up: the designed black button is shown, with a fallback link');
    const cover = await page.evaluate(() => { const b = document.getElementById('acc-google').getBoundingClientRect(), g = document.querySelector('#acc-gsi > *').getBoundingClientRect(); return { op: +getComputedStyle(document.getElementById('acc-gsi')).opacity, dx: Math.abs(b.width - g.width) + Math.abs(b.height - g.height) + Math.abs(b.left - g.left) + Math.abs(b.top - g.top) }; });
    ok(cover.op < 0.05 && cover.dx < 3, 'google pop-up: Google\u2019s button is invisible and covers the designed button exactly ' + JSON.stringify(cover));
    ok(await page.evaluate(() => window.__gsi.client_id === 'test-client.apps.googleusercontent.com' && window.__gsiOpt.theme === 'filled_black'), 'google pop-up: set up with the Client ID and a black button');
    const c = await page.locator('#acc-google').boundingBox();
    await page.mouse.click(c.x + c.width * 0.9, c.y + c.height * 0.85); // tap near the corner of the designed button
    await page.waitForFunction(() => window.__BD.Cloud.user && window.__BD.Cloud.user.email === 'g@example.com', null, { timeout: 5000 }).catch(() => {});
    const args = await page.evaluate(() => window.__idTokenArgs);
    const hashed = await page.evaluate(() => window.__gsi.nonce);
    const crypto = require('crypto');
    ok(args && args.provider === 'google' && args.token === 'header.payload.sig' && crypto.createHash('sha256').update(args.nonce).digest('hex') === hashed, 'google pop-up: token passed to Supabase with a matching nonce');
    ok(await page.isHidden('#overlay') && /g@example\.com/.test(await page.textContent('#btn-account')), 'google pop-up: signed in and login screen closed');
    ok(errs.length === 0, 'google pop-up: no errors ' + errs.join(' | '));
    await ctx.close();
  }
  // If a tap reaches the designed button itself, it asks Google for its prompt and never redirects.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.exposeFunction('__sb', (op, a) => backend(op, a));
    await ctx.route('**/supabase.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB.replace("signInWithOAuth:async()=>(", "signInWithOAuth:async()=>(window.__redirected=true,") }));
    await ctx.route('**/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{id:{initialize(o){window.__gsi=o;},renderButton(){},prompt(cb){window.__prompted=true;window.__gsi.callback({credential:'p.q.r'});}}}};` }));
    await ctx.addInitScript(() => { window.__TEST_GOOGLE_ID = 'test-client.apps.googleusercontent.com'; localStorage.setItem('borderdesk.v1', JSON.stringify({ tutorialDone: true })); });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.click('#btn-account');
    await page.waitForSelector('#acc-google');
    await page.evaluate(() => { document.getElementById('acc-gsi').hidden = true; }); // the tap reaches the designed button
    await page.click('#acc-google');
    await page.waitForFunction(() => window.__BD.Cloud.user, null, { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate(() => window.__prompted && !window.__redirected), 'google: designed button opens Google\u2019s prompt, never the old redirect page');
    ok(await page.evaluate(() => !!(window.__BD.Cloud.user && window.__BD.Cloud.user.email === 'g@example.com')), 'google: signed in through the prompt');
    await ctx.close();
  }
  // Claude artifact version: saves to the viewer's Claude account through a stand-in db.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => {
      localStorage.setItem('borderdesk.v1', JSON.stringify({ tutorialDone: true, crowns: 40 }));
      const store = {};
      window.__store = store;
      const db = { doc: p => ({ get: async () => ({ exists: p in store, data: () => store[p] }), set: async d => { store[p] = d; }, delete: async () => { delete store[p]; } }) };
      window.claude = { use: async n => n === 'db' ? db : n === 'user' ? { id: async () => 'viewer-1' } : null };
    });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__BD.Cloud.lastSync > 0, null, { timeout: 5000 }).catch(() => {});
    const stored = await page.evaluate(() => window.__store['data/users/viewer-1/save']);
    ok(stored && JSON.parse(stored.json).crowns === 40, 'Claude version: save written to the viewer’s private document');
    ok(/Claude account/.test(await page.textContent('#btn-account')), 'Claude version: menu says it saves to your Claude account');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
