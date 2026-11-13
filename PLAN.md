# Plan: Border Desk v2 features

## Context
Border Desk v1 is built and pushed (`index.html` single file, branch `claude/relaxed-euler-h7n9ce`, artifact https://claude.ai/artifact/T7X67Cxe17RTTxAJUi8QPT). The user picked six additions:
**booth upgrades shop, Detain + questioning, new rules for days 9–14, random daily events, guided tutorial, drag & compare papers.**
Today days after 8 just repeat the same rules, story pay has no use, and the only help is a text screen; these features fix that.

Everything stays in `index.html`: the engine in `<script id="engine">` (no DOM, tested by `tests/engine.test.js`) and the UI script below it. Existing pieces to reuse:
- engine: `RULES`, `CHECK`, `PLANT`, `makeDay`, `makeTraveler`, `audit`, `rng`, `alterName/alterNumber`
- UI: `decide()`, `nextTraveler()`, `renderTraveler()`, `renderBook()`, `hud()`, `overlay()`/`runScene()`, `pick()` (Inspect), save object `SV` + `persist()`, `STORY` data, `sound()`

## 1. New rules, days 9–14 (engine)
Each gets `CHECK` + `PLANT` and two inspect fields, same pattern as the existing rules. After day 14 every rule is active.

| Day | Rule | New data | Inspect pair |
|---|---|---|---|
| 9 | **Stay**: the length of stay the traveler *says* must match the entry ticket | `ticket.stay`, `t.answers.stay` | `answer.stay` + `ticket.stay` |
| 10 | **Height**: passport height must match the booth's height chart (±4 cm) | `pp.height`, `t.height` | `passport.height` + `booth.height` |
| 11 | **Fingerprint**: work-pass print must match the traveler's print (asked for in the booth) | `work.print`, `t.print` (pattern: whorl/loop/arch + variant, drawn as SVG) | `work.print` + `booth.print` |
| 12 | **Transit**: transit travelers need a transit slip leaving within 2 days | new purpose `transit`, doc `transit {name, until}` | `transit.until` + `desk.date` / missing: `rule.transit` + `booth.purpose` |
| 13 | **Diplomats**: diplomatic passports (gold cover) skip ticket, vaccine and closed-country rules but need an accreditation letter from the same country | `pp.diplomat`, doc `letter {name, country}` | `letter.country` + `passport.country` |
| 14 | **Minors**: under-18s need a guardian consent form; guardian's surname matches | ages 8–17 only when active, doc `consent {name, guardian}` | `consent.guardian` + `passport.name` |

The diplomat exemption is a check inside `ticket`, `vaccine` and `banned`. **Crimes:** issues from `photo`, `city`, `seal`, `fingerprint` and the forged-`letter` variant get `crime: true` (impostors and forgers). Expired papers and missing tickets don't.

## 2. Detain + questioning (UI)
- **Detain**, a third stamp unlocked on day 4 (key `X`). `decide('approve'|'deny'|'detain')`:
  - detaining a traveler with a crime: correct, +25 × multiplier (story +15 cr);
  - detaining someone who's only invalid: citation, "Wrongful detention";
  - detaining a valid traveler: citation;
  - denying a criminal stays correct, just without the bonus.
- **Ask** button in the booth opens a question list: *Purpose of your visit?*, *How long are you staying?*, *Where will you stay?*, and from day 11 *Fingerprint, please*. Answers go into a small transcript in the booth.
  - The stay answer is a tappable field (`answer.stay`); the fingerprint card becomes `booth.print`.
  - Criminals sometimes dodge a question ("Why do you ask?") as a soft clue.
- **Story:** Brel introduces Detain on day 4. Detaining Fenn Kovac (day 5 fake seal, or later) sets `F.fennCaught`, which the endings mention. Days 9–10 intros teach Stay and Height.

## 3. Random daily events
`makeDay` rolls an event from day 3, 40% of shifts in Arcade and Endless (Endless rolls a new one every 15 travelers). It's announced on a banner at shift start and shown as a HUD chip. Story uses fixed events: rush hour day 5, inspector day 7, power cut day 9.
- **Rush hour:** 2-minute shift, travelers arrive twice as fast, points ×1.5.
- **Inspector visit:** correct calls and citations both count double.
- **VIP:** one traveler with bad papers says "Do you know who I am?". Denying them gives +30 ("Brel backs you up").
- **Power cut:** documents are dark. Tapping one lights it for 4 s. The UV lamp lights everything.

## 4. Booth upgrades shop
One wallet, `SV.crowns`, shared by all modes:
- Arcade earns score ÷ 5.
- Endless earns 2 per correct call.
- Story earns that day's pay. Endings still use flags and citations, not money.

**Shop** is a screen opened from the menu and after every shift or story day. Purchases are permanent (`SV.upgrades`). Each owned tool shows a toggle or works on its own.

| Item | Price | Effect |
|---|---|---|
| Quick stamp | 80 | Next traveler arrives in 0.6 s instead of 1.3 s |
| Checklist card | 100 | Lists which rules apply to *this* traveler (doesn't give the answer) |
| Thermos | 120 | +20 s on every arcade shift |
| UV lamp | 150 | `UV` toggle: fake seals and forged letters glow, real passports show a watermark; also beats power cuts |
| Lucky charm | 200 | First citation of each shift is forgiven (in Endless, one extra life) |

## 5. Drag & compare papers (wide screens ≥ 900 px, including iPad landscape)
- Documents become absolutely positioned on the desk, starting in a fanned cascade. Drag them by their header using pointer events, with `touch-action:none` on headers only.
- The last touched document comes to the front. A movement under 5 px counts as a tap, so Inspect taps on fields still work.
- **Line up** button snaps the two most recently touched documents side by side.
- Positions reset for each traveler. Phones keep the swipe row.

## 6. Guided tutorial
- A coach-mark component: a spotlight (big `box-shadow` cutout around the target), a speech bubble, and Next/Skip. A step can wait for an action ("Press Approve").
- Scripted 3-traveler tutorial using `makeTraveler` with forced plants:
  1. valid papers: point at the face, photo, expiry and date, then Approve;
  2. expired passport: Deny;
  3. a different face: Inspect, tap photo + face, then Detain.
- Runs automatically the first time (replacing the text screen), and can be replayed from the menu.
- A one-time tip for each **new rule** when it unlocks: spotlight the "NEW TODAY" rule and the document field it is about.

## 7. Multiplayer race ("who gets through the day fastest")
All racers get the **same day**: same seed, rules, event and travelers. The race is a fixed number of travelers, which the host picks (8 / 12 / 16 / 20, default 12).
- **Race time** = your own elapsed time **+ 10 s per mistake**. Lowest time wins. Detain/Inspect bonuses take 2 s off each.
- **Result screen:** places, times, mistakes, and a "rematch" button that starts a new seed.
- Menu gets a 4th mode card, **Race**, with two buttons: **Online** and **Same device**.

**Refactor needed first:** the game screen is written for one player (global `S`, fixed element ids). It gets turned into a `Desk` component that holds its own state and renders into a container: booth, documents, stamp buttons and HUD. Solo modes use one `Desk`; split-screen uses two. The rulebook stays a shared panel. The engine needs no change, because travelers come from `makeDay(day, seed)` + `makeTraveler(c, rng(seed))`, so the same seed gives everyone identical travelers.

**Online race (Claude artifact version only)** uses the artifact's `room` capability (declared as `capabilities: {room: {}}`). No server of our own is needed.
- **Lobby:**
  - The host taps *Create race* and gets a 4-letter code. Others type the code, which joins `room.join("race-<code>")`.
  - Everyone types a nickname, stored in their presence.
  - The lobby lists who's in the race, with a "you" marker.
- **Everything goes through presence, not events,** so it works for any viewer, not just editors.
  - Host presence: `{role:"host", name, seed, day, count, go}`.
  - Racer presence: `{name, ready, at, cites, done}`.
  - When the host taps *Start*, it sets `go` to a new number. Each client sees it, runs a 3-2-1 countdown and starts its own clock.
  - Finishers publish `done` (their race time). The live progress bars come from everyone's `at`.
- **Who can play:** people signed in to claude.ai and either in your organization or invited to the artifact. Public-link visitors can't connect (a platform rule).
  - If `claude.use("room")` returns null, the Online button shows "Online races work in the Claude version when it's shared with you".
- **Not on GitHub Pages:** it has no server, so the Online button there explains that and links to the artifact. Adding Pages support later would need a hosted realtime service (for example Supabase) with an API key.

**Same-device race (works everywhere, offline)**
- **Split screen** on wide screens (≥ 900 px: computers, iPad landscape). 2 players get two `Desk`s side by side with the rulebook in the middle. Each half has its own Approve / Deny / Detain buttons, so two people can share an iPad. Keyboard: P1 `A` / `D` / `X`, P2 `←` / `→` / `↓`. Inspect and Ask are off in split screen to keep it fast.
- **Pass-and-play** on phones (or by choice), for 2–6 players. Each player plays the same day in turn, with a "Hand the phone to <name>" screen in between. The final screen ranks everyone.

## 8. More travelers per day
- **Story:** days grow from 8 travelers to **10 on day 1, rising to 15 on day 10** (`10 + floor(day/2)`), plus the scripted characters.
- **Arcade:** the gap between travelers drops from 1.3 s to **0.8 s** (Quick stamp upgrade: 0.4 s), so a 3-minute shift sees more people. Arrival speeds up a little through the shift. Rush hour doubles it.
- **Endless:** starts at the faster pace as well.
- **Race:** host picks 8–20.

## Work order
0. Refactor the game screen into a `Desk` component (no behavior change; existing tests must stay green).
1. Engine: rules 9–14, diplomat exemptions, crime flag. Extend the engine test.
2. 3-way decisions, Detain button, Ask panel and transcript, new document renderers (height chart, fingerprint, transit, letter, consent).
3. Events.
4. Wallet, shop screen, upgrades.
5. Drag & compare.
6. Coach marks, tutorial, new-rule tips.
7. Story updates (Detain intro, day 9–10 rules, fixed events, Fenn flag, endings text, more travelers per day).
8. Race: same-device split screen and pass-and-play, then the online race over `room`. Republish the artifact with `capabilities: {room: {}}`.
9. Bump `VERSION` in `sw.js`. Update README and PLAN.md, rebuild the artifact (`node tools/build-artifact.js`) and republish it to the same URL, then commit and push.

## Status (after the worker restart)
Steps 0–9 are built, all browser and engine tests pass, and the artifact is republished (version 2, with `room` declared).
One thing is left: **commit and push** the last `index.html` fixes, which are local only:
- the phone grid fix that kept the stamp buttons on screen;
- a readable "Next" button in the tutorial.

## Verification
- `node tests/engine.test.js` covers days 1–20: valid travelers pass, every planted rule (new ones included) is caught, diplomats are exempt, and `crime` is set only for the crime rules.
- `node tests/e2e.js` adds:
  - Detain right and wrong;
  - Ask → stay answer flagged with the ticket;
  - buy the UV lamp → its toggle appears;
  - event banner shows for a forced event;
  - full tutorial run with real clicks;
  - desktop drag moves a document and a field tap still flags;
  - existing iOS gate and phone layout tests stay green.
- Race tests:
  - split screen with two players pressing their own keys;
  - pass-and-play with 3 players, ranking correct with penalties;
  - same seed gives identical travelers for both desks;
  - with no `room` (Pages, plain browser), the Online button shows the explanation instead of failing.
- The online race can only be tested for real inside claude.ai with two signed-in people. After publishing, I'll ask you to open the artifact on two devices, or share it with a friend, and run one race.
- Screenshot check of desktop, iPhone and iPad layouts with the new buttons (no horizontal scroll, action bar fits at 393 px).
