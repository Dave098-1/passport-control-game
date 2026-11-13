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
const fail = (msg, t) => { console.error('FAIL:', msg, JSON.stringify(t, null, 1)); process.exit(1); };
const N = 1000;

for (const day of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 99]) {
  for (let seed = 1; seed <= 5; seed++) {
    const c = BD.makeDay(day, seed * 7777, day === 99 ? { today: 15 } : undefined);
    const r = BD.rng(seed * 31 + day);
    for (let i = 0; i < N / 5; i++) {
      // Valid travelers must pass every active rule.
      const t = BD.makeTraveler(c, r, { p: 0 });
      if (t.issues.length) fail(`day ${day}: valid traveler has issues ${t.issues.map(x => x.rule)}`, t);
      checks++;
      // Each active rule, when planted, must be caught by that rule.
      for (const id of c.rules) {
        const u = BD.makeTraveler(c, r, { p: 0 });
        if (!BD.PLANT[id](u, c, r, { subtle: i % 2 === 0 })) continue;
        const issues = BD.audit(u, c);
        if (!issues.some(x => x.rule === id)) fail(`day ${day}: planted ${id} not detected`, u);
        for (const x of issues) if (x.fields.length !== 2) fail(`issue ${x.rule} needs 2 fields`, x);
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
const unlock = [1, 2, 3, 4, 5, 6, 7, 8].map(d => BD.makeDay(d, 1).rules.size);
if (unlock.join() !== '2,3,5,6,7,8,9,10') fail('rule unlock schedule ' + unlock.join(), {});
console.log(`engine OK (${checks} checks)`);
