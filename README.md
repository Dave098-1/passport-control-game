# Border Desk

A passport control game for desktop and mobile browsers. You are an officer at the Eastern Checkpoint of Veldmark: check each traveler's papers against the day's rules, then stamp **Approve**, **Deny** or **Detain**.

**Play:** https://dave098-1.github.io/passport-control-game/ (online races need the Claude version: https://claude.ai/artifact/T7X67Cxe17RTTxAJUi8QPT)

## Modes
- **Story**: 10 days, 10–15 travelers a day, with recurring characters, bribes, a smuggler you can detain, and choices that lead to one of four endings.
- **Race**: everyone gets the same day and the same travelers. Fastest time wins; each mistake adds 10 s, each detain or flagged discrepancy takes off 2 s.
  - *Online* (Claude version): create a race, share the 4-letter code, watch live progress bars.
  - *Same device*: split screen for 2 players on a computer or iPad, or pass-and-play for 2–6 players on a phone.
- **Arcade**: 3-minute shifts. A new rule each day up to day 14. Streaks raise your score multiplier.
- **Endless**: every rule at once, getting harder, until you make 3 mistakes.
- **Tutorial**: a guided first shift with three travelers. Runs automatically the first time.

## The job
- **Approve** papers that pass every rule. **Deny** papers that break a rule. **Detain** impostors and forgers: wrong face, fake issuing city, fake seal, someone else's fingerprint, forged embassy letter.
- **Ask** travelers questions. From day 9 their answer about length of stay must match their ticket; from day 11 you take workers' fingerprints.
- **Inspect**: tap two things that disagree for a bonus.
- On a computer or iPad in landscape, drag documents by their header and press **Line up** to compare two side by side.
- **Daily events** (from day 3): rush hour, inspector visit, a pushy VIP, or a power cut.
- **Booth shop**: spend the crowns you earn on Quick stamp, Checklist card, Thermos, UV lamp and Lucky charm.

## Controls
| Action | Touch / mouse | Keyboard (split-screen player 2) |
| --- | --- | --- |
| Approve | Approve | `A` (`→`) |
| Deny | Deny | `D` (`←`) |
| Detain | Detain | `X` (`↓`) |
| Inspect | Inspect | `I` |
| Rulebook (phones) | Rules | `R` |
| UV lamp (if owned) | UV | `U` |
| Pause | ⏸ | `Esc` |

## iPhone and iPad
On iOS the game only runs from the Home Screen. Opening it in Safari or another browser shows step-by-step instructions: Share → **Add to Home Screen** → **Add**, then open Border Desk from the Home Screen. Android and desktop browsers play straight away.

## Project layout
| File | Purpose |
| --- | --- |
| `index.html` | The whole game: HTML, CSS, the rules engine (`<script id="engine">`) and the UI |
| `manifest.webmanifest`, `icons/`, `sw.js` | Home Screen app and offline support on GitHub Pages |
| `tools/gen-icons.js` | Renders the app icons (`node tools/gen-icons.js`) |
| `tools/build-artifact.js` | Makes the Claude artifact version of `index.html` (published with the `room` capability for online races) |
| `tests/engine.test.js` | Rules engine test (`node tests/engine.test.js`) |
| `tests/e2e.js` | Browser tests with Playwright (`node tests/e2e.js`) |

## Publishing on GitHub Pages
Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`. When `index.html` changes, bump `VERSION` in `sw.js` so installed copies pick up the update.
