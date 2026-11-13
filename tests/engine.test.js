// Checks the rules engine inside index.html: valid travelers pass every rule,
// and every planted discrepancy is caught by the rule it targets.
// Run: node tests/engine.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ctx = {};
vm.runInNewContext(src, { globalThis: ctx });
const BD = ctx.BD;

let checks = 0;
const CRIMES = new Set(['photo', 'city', 'seal', 'fingerprint', 'diplomat']);
let diplomats = 0, minors = 0, transits = 0;
const fail = (msg, t) => { console.error('FAIL:', msg, JSON.stringify(t, null, 1)); process.exit(1); };
const N = 1000;

for (const day of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 99]) {
  for (let seed = 1; seed <= 5; seed++) {
    const c = BD.makeDay(day, seed * 7777, day === 99 ? { today: 15 } : undefined);
    const r = BD.rng(seed * 31 + day);
    for (let i = 0; i < N / 5; i++) {
      // Valid travelers must pass every active rule.
      const t = BD.makeTraveler(c, r, { p: 0 });
      if (t.issues.length) fail(`day ${day}: valid traveler has issues ${t.issues.map(x => x.rule)}`, t);
      if (t.docs.passport.diplomat) { diplomats++; if (t.docs.ticket || t.docs.vaccine) fail('diplomat must carry no ticket/vaccine', t); }
      if (BD.isMinor(t, c)) { minors++; if (!c.rules.has('consent')) fail('minor before consent rule', t); }
      if (t.purpose === 'transit') transits++;
      checks++;
      // Each active rule, when planted, must be caught by that rule.
      for (const id of c.rules) {
        const u = BD.makeTraveler(c, r, { p: 0 });
        if (!BD.PLANT[id](u, c, r, { subtle: i % 2 === 0 })) continue;
        const issues = BD.audit(u, c);
        if (!issues.some(x => x.rule === id)) fail(`day ${day}: planted ${id} not detected`, u);
        for (const x of issues) {
          if (x.fields.length !== 2) fail(`issue ${x.rule} needs 2 fields`, x);
          if (x.crime && !CRIMES.has(x.rule)) fail(`${x.rule} must not be a crime`, x);
          if (x.rule === 'diplomat' && x.crime !== (x.fields[0] === 'letter.country')) fail('only a forged letter is a crime', x);
        }
        if (BD.finalize(u, c).crime !== issues.some(x => x.crime)) fail('crime flag', u);
        checks++;
      }
      // Random generation: planted list non-empty <=> issues non-empty.
      const v = BD.makeTraveler(c, r, { p: 0.5 });
      if ((v.planted.length > 0) !== (v.issues.length > 0)) fail(`day ${day}: planted/issues mismatch`, v);
      checks++;
    }
  }
}
// Rules unlock one per day as designed.
const unlock = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(d => BD.makeDay(d, 1).rules.size);
if (unlock.join() !== '2,3,5,6,7,8,9,10,11,12,13,14,15,16,16') fail('rule unlock schedule ' + unlock.join(), {});
if (!diplomats || !minors || !transits) fail(`new traveler kinds not generated: ${diplomats}/${minors}/${transits}`, {});
// Diplomats from the closed country, without ticket or vaccine slip, are still valid.
{ const c = BD.makeDay(14, 3); const r = BD.rng(9); let n = 0;
  for (let i = 0; i < 3000; i++) { const t = BD.makeTraveler(c, r, { p: 0 }); if (!t.docs.passport.diplomat) continue;
    t.docs.passport.country = c.banned; t.docs.letter.country = c.banned; t.docs.passport.city = BD.COUNTRIES[c.banned][0];
    if (BD.audit(t, c).length) fail('diplomat exemption', BD.audit(t, c)); n++; }
  if (!n) fail('no diplomats for exemption test', {}); }
// Same seed -> identical travelers (multiplayer races depend on this).
{ const a = BD.makeDay(10, 42), b = BD.makeDay(10, 42); const ra = BD.rng(43), rb = BD.rng(43);
  for (let i = 0; i < 50; i++) if (JSON.stringify(BD.makeTraveler(a, ra, { p: .45 })) !== JSON.stringify(BD.makeTraveler(b, rb, { p: .45 }))) fail('race determinism', {}); }
// Events: none before day 3; seeded.
for (let s = 0; s < 200; s++) { if (BD.makeDay(2, s).event) fail('event before day 3', {}); }
if (BD.makeDay(9, 77).event !== BD.makeDay(9, 77).event) fail('event not seeded', {});
console.log(`engine OK (${checks} checks)`);
