# Border Desk

A passport control game for desktop and mobile browsers. You are an officer at the Eastern Checkpoint of Veldmark: check each traveler's papers against the day's rules, then stamp **Approve** or **Deny**.

**Play:** https://dave098-1.github.io/passport-control-game/

## Modes
- **Story**: 10 days with recurring characters, bribes, and choices that lead to one of four endings.
- **Arcade**: 3-minute shifts. Each day adds a rule. Streaks raise your score multiplier.
- **Endless**: every rule at once, getting harder, until you make 3 mistakes.

## Controls
| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Approve | Approve button | `A` |
| Deny | Deny button | `D` |
| Inspect (tap two things that disagree for a bonus) | Inspect button | `I` |
| Rulebook (phones) | Rules button | `R` |
| Pause | ⏸ | `Esc` |

## iPhone and iPad
On iOS the game only runs from the Home Screen. Opening it in Safari or another browser shows step-by-step instructions: Share → **Add to Home Screen** → **Add**, then open Border Desk from the Home Screen. Android and desktop browsers play straight away (Android can also install it from the menu).

## Project layout
| File | Purpose |
| --- | --- |
| `index.html` | The whole game: HTML, CSS, the rules engine (`<script id="engine">`) and the UI |
| `manifest.webmanifest`, `icons/`, `sw.js` | Home Screen app and offline support on GitHub Pages |
| `tools/gen-icons.js` | Renders the app icons (`node tools/gen-icons.js`) |
| `tools/build-artifact.js` | Makes the Claude artifact version of `index.html` |
| `tests/engine.test.js` | Rules engine test (`node tests/engine.test.js`) |
| `tests/e2e.js` | Browser tests with Playwright on desktop, iPhone, iPad and Android (`node tests/e2e.js`) |

## Publishing on GitHub Pages
Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`. When `index.html` changes, bump `VERSION` in `sw.js` so installed copies pick up the update.
