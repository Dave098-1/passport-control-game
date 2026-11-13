# Plan: "Border Desk", a passport control game (browser, mobile + desktop, Home Screen app)

## Context
The repo `passport-control-game` is empty (just `README.md`). The goal is an original, document-inspection passport control game that:
- plays in any desktop or mobile browser (mouse, touch, keyboard),
- is published as a Claude artifact **and** on GitHub Pages (user's choice), so the Home Screen version is a real full-screen app whose manifest and icon we control,
- **on iOS, refuses to run in the browser** and shows step-by-step "Add to Home Screen" instructions; it only plays when launched from the Home Screen,
- has three modes: **Arcade shifts**, **Story campaign** and **Endless**.

Everything is original: the name, fictional countries, art (made in code, as SVG/CSS) and rules. It is in the inspection-game genre but does not copy any existing game.

## Architecture
Vanilla HTML/CSS/JS, no build step and no external dependencies. That way the same file works as an artifact and as a static site.

```
index.html          ← whole game (inline CSS + JS), the artifact source
manifest.webmanifest← name, display: "standalone", icons, theme color (Pages only)
icons/icon-180.png, icon-192.png, icon-512.png  (apple-touch-icon + manifest)
sw.js               ← small service worker: cache index.html + icons for offline play (Pages only)
tools/gen-icons.js  ← Playwright script that renders the SVG logo to PNG icons
.github/workflows/pages.yml ← deploy repo root to GitHub Pages on push to main
README.md           ← how to play / install
```
`index.html` links the manifest, `apple-touch-icon` and `<meta name="apple-mobile-web-app-capable" content="yes">`, and registers `sw.js` only if it exists (on Pages). Inside the artifact those tags have no effect, which is harmless.

Organization of the JS inside `index.html` (sections, not separate files):
1. `platform`: iOS and standalone detection, the gate screen
2. `rng`: seeded PRNG (mulberry32) so days and runs can be reproduced
3. `data`: fictional countries, names, document templates, the rules list
4. `gen`: makes travelers with documents and (sometimes) planted discrepancies
5. `rules`: one rule = `{id, text, check(traveler, day) → null | discrepancy}`
6. `ui`: desk layout, document cards, stamping, the rulebook, the inspect/compare tool
7. `modes`: arcade, story and endless controllers sharing one `Shift` engine
8. `save`: localStorage wrapped in try/catch (high scores, story progress, settings)
9. `audio`: tiny WebAudio sounds (stamp thunk, buzzer), off when muted

## iOS gate (the key requirement)
```js
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
const isStandalone = navigator.standalone === true ||
              matchMedia('(display-mode: standalone)').matches;
if (isIOS && !isStandalone) showInstallGate(); else boot();
```
The gate is a full-screen block with no way into the game. It contains:
- a short heading ("Install to play") and an illustrated 3-step guide: **1.** tap the Share button (an inline SVG of the iOS share icon) → **2.** scroll down, tap **Add to Home Screen** → **3.** tap **Add**, then open *Border Desk* from your Home Screen,
- variants by browser: Safari (Share is in the bottom bar on iPhone and the top bar on iPad), Chrome/Firefox/Edge on iOS (`CriOS|FxiOS|EdgiOS`: Share button in the address bar, iOS 16.4+), and in-app browsers (Instagram, Facebook, Gmail and so on: "Open this page in Safari first", with a copy-link button),
- an animated arrow pointing at where the Share button is.

Android and desktop are never blocked. On Android a dismissible "Install app" banner uses `beforeinstallprompt` (Pages only).

**Behavior as an artifact:** Phase 0 checks what `navigator.standalone` and `display-mode` report inside the claude.ai frame when the artifact is opened from an iOS Home Screen icon.
- If detection works there, the gate applies to the artifact the same way.
- If it does not, the artifact on iOS shows the same gate. The step-by-step guide then points to the GitHub Pages URL, the reliable installable version, so no one gets stuck on a screen they can never get past.

## Game design
**Core loop (all modes):** a traveler walks up and hands over 1–4 documents: passport, entry ticket, work pass, ID card, vaccine slip. The player compares them with the day's **bulletin** (the current rules) and with each other, then stamps **APPROVE** or **DENY**. Optional **Inspect** mode: tap two mismatched fields (for example, the passport name and the permit name) to "flag" them, which earns a bonus and makes the traveler admit the discrepancy. Mistakes give a citation; 3 citations in a shift give a penalty, or end the run in Endless.

**Checks (introduced gradually):** passport expired, issuing country not on the allowed list, a required document missing, names that don't match, ID numbers that don't match, photo doesn't match the face (generated faces with different hair, glasses and so on), wrong seal on a permit, entry date outside the permit window, a banned country for today, a forged-looking document (wrong font or color).

**Generator:** each traveler is valid by default. With probability *p(day)*, 1–2 discrepancies are planted, picked only from the rules active today. Faces are SVG made of parts (head shape, skin tone, hair, eyes, glasses, beard), so the photo-mismatch check works by changing one part.

**Modes:**
- **Arcade shifts:** 3-minute shift; each new day adds one rule (days 1–10 and then random mixes). Score = correct decisions × streak multiplier + flag bonuses − citations. Best score per day is saved.
- **Story campaign:** about 10 days at the fictional border of "Veldmark". Short scripted scenes between days, recurring characters (smuggler, family, a reporter) and 2–3 choices (let a traveler through against the rules, take a bribe, report a colleague) that unlock one of three endings. Story travelers are hand-written entries added to the normal generator queue.
- **Endless:** no timer and all rules active, more and more difficult (more documents, subtler discrepancies), 3 mistakes and the run is over. Saves best count.

## Layout and controls (mobile + desktop)
- **Landscape/desktop:** traveler booth on the left, desk with documents in the middle, rulebook and bulletin on the right.
- **Portrait phone:** booth strip at the top, desk below it, rulebook as a pull-up drawer. Documents appear as a stack you swipe through, and tapping one opens it full width.
- Pointer events everywhere (drag documents on desktop, tap and swipe on touch). Big APPROVE/DENY stamp buttons in the thumb zone.
- Keyboard: `A` approve, `D` deny, `I` inspect, `R` rulebook, `Esc` pause.
- `env(safe-area-inset-*)` padding for the notch and home bar in standalone mode, `100dvh`, no page scroll or zoom while playing, `touch-action: manipulation`.
- Color tokens on `:root` with a dark theme, a 16px gutter at phone width, settings for reduced motion and sound.

## Implementation phases
0. **Detection probe:** publish a tiny artifact that prints `userAgent`, `navigator.standalone`, `display-mode` and `window.top === window`. The user adds it to their Home Screen on an iPhone and reports what it shows. This decides the artifact-side gate behavior described above.
1. **Shell + gate:** `index.html` with the platform detection, the install gate (all browser variants), the main menu, and the responsive desk layout with placeholders.
2. **Engine:** seeded RNG, data, the traveler generator, the rules engine with the first 4 rules, a single shift with stamping and scoring.
3. **Arcade mode:** all 10 rules, timer, citations, end-of-shift summary, high scores.
4. **Endless mode** (reuses the engine; difficulty curve).
5. **Story mode:** scene system, about 10 days of content, choices, endings, saved progress.
6. **Polish:** SVG faces and documents, stamp animation, sounds, tutorial for day 1, accessibility (focus order, ARIA labels on stamps).
7. **Installable app:** manifest, icons (`tools/gen-icons.js`), `sw.js`, Pages workflow, README.
8. **Publish:** commit and push to `claude/relaxed-euler-h7n9ce`, publish the artifact, and give both links.

## Verification
- **Playwright (headless Chromium, already installed):** scripted runs of
  - desktop 1280×800: menu → arcade shift → approve and deny → summary; no console errors,
  - emulated `iPhone 15` (Safari UA): the gate is shown and the game does not start,
  - the iPhone UA with `navigator.standalone = true` injected via `addInitScript`: the game starts,
  - iPad UA (`MacIntel` + touch points) and the `CriOS` and Instagram UAs: the right gate variant shows,
  - `Pixel 7` emulation: no gate; the portrait layout has no horizontal scroll,
  - screenshots of each one, to look at the layout.
- **Rules unit check:** a node script loads the engine section and generates 1,000 travelers per day, asserting that each planted discrepancy is caught by its rule and that valid travelers pass every rule.
- **Real device (user):** on an iPhone, open the Pages URL in Safari → gate → Add to Home Screen → launch → game runs full screen, works offline after the first load.
