# Plan: Border Desk accounts (cross-device saves)

## Context
v2 is built, pushed and open as PR #1. Today every save lives in the browser's `localStorage` under `borderdesk.v1` (`SV` + `persist()` in `index.html`), so progress stays on one device. On iPhone, the Home Screen app also has storage separate from Safari.

The user wants an **optional login** so players can keep their story progress, crowns, tools, best scores and settings on every device. Choices made:
- **Supabase** as the backend. Their org "dave098" is connected and has no projects yet.
- **Email + password** login.

Guests keep playing exactly as now, with no login required.

## Where it runs (answer to "where do I upload this?")
Nothing new to host. The setup stays:
- **The game** (the login page included) stays on **GitHub Pages**: https://dave098-1.github.io/passport-control-game/. Merge PR #1, plus a follow-up commit with accounts, and it's live.
- **The server part** (accounts, passwords, Google sign-in, saves) is **Supabase**, which hosts it for free. The game talks to it straight from the browser.
- **Google** only needs to know the Pages address and the Supabase callback address. Both are in the setup guide.

## 1. Supabase project (via the Supabase MCP tools)
1. Create a free project `border-desk` in org `dave098`. Check the cost with the confirm-cost step first; the free tier is $0.
2. Migration `create_saves`:
   ```sql
   create table public.saves (
     user_id uuid primary key references auth.users on delete cascade,
     data jsonb not null check (pg_column_size(data) < 100000),
     updated_at timestamptz not null default now()
   );
   alter table public.saves enable row level security;
   create policy "own save: read"   on public.saves for select using (auth.uid() = user_id);
   create policy "own save: insert" on public.saves for insert with check (auth.uid() = user_id);
   create policy "own save: update" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   create policy "own save: delete" on public.saves for delete using (auth.uid() = user_id);
   ```
3. Run `get_advisors` (security) and fix anything it flags. Then fetch the project URL and the **publishable** key. Both are safe to put in the page, because RLS stops anyone reading another player's save.
4. **You do one thing in the dashboard:** Authentication → Sign In / Providers → Email → turn off **Confirm email**.
   - Supabase's built-in email sender only allows a few emails per hour, so with confirmation on, sign-ups would get stuck.
   - Password-reset emails still work, within that same hourly limit.

## 2. Login + sync in the game (`index.html`, GitHub Pages version)
- **Library:** load `@supabase/supabase-js` pinned (`cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js`).
  - Load it only when a player opens the Account screen, or a saved session exists.
  - Without internet the game works as today.
- **Menu:** a new **Account** button.
  - Signed out: "Log in to save across devices".
  - Signed in: "email · Synced 2 min ago".
- **Account screen** (overlay, same style as the shop):
  - **Log in** and **Create account** tabs: email, password, and repeat password on sign-up. Error messages say what to fix ("Wrong email or password", "Password needs 8+ characters").
  - **Forgot password:** sends the reset email. When the link opens the game (`PASSWORD_RECOVERY` event), a "Set a new password" form appears.
  - Signed in: **Sync now**, **Log out**, and **Delete my cloud save**. Deleting the account itself needs a server function, so it's left out for now.
- **Sync rules** (a small `Cloud` module; storage adapters described in §3):
  - `persist()` stamps `SV.updatedAt`. When signed in, it uploads 2 s after the last change (debounced) and when the app goes to the background.
  - **First login on a device:**
    - no cloud save yet → upload this device's save;
    - this device has no progress → take the cloud save;
    - both have progress → ask "Keep cloud save (Story day 7, 420 crowns, saved Tuesday) or this device's (Story day 3, 80 crowns)?".
  - **After that:** on app start and when the app comes back to the front, the newer save wins automatically. Saves are only applied while on the menu, never mid-shift.
  - Synced: everything in `SV` except per-device settings (`sound`).
  - Logging out keeps the local save on that device.
- **iPhone:** email + password works inside the Home Screen app, and the session stays in that app's own storage.

## 2b. Google sign-in (added at the user's request)
- **Account screen:** a **Continue with Google** button (`supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo: PAGES_URL}})`) above the email + password form.
- **Look:** waiting on the picture the user is resending. The layout and styling will match it. Until it arrives: Google button, an "or" divider, then email + password, in the game's colors.
- **Setup:** I do my part; for yours, I give you a click-by-click guide with the exact values filled in, once the project exists.
  1. **Google Cloud Console:**
     - create a project;
     - fill in the OAuth consent screen (External, app name "Border Desk", your email);
     - Credentials → Create OAuth client ID → *Web application*.
     - Authorized JavaScript origin: `https://dave098-1.github.io`.
     - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. I'll give you the exact value.
     - Copy the Client ID and Client secret.
  2. **Supabase dashboard:**
     - Authentication → Sign In / Providers → **Google** → enable, paste the ID and secret.
     - Authentication → URL Configuration → Site URL = the Pages URL, and add it to Redirect URLs.
     - Never paste the secret into the chat.
- **iPhone caveat:** Google sign-in sends the page away to Google and back.
  - In some iOS versions, a Home Screen app finishes that sign-in in a Safari window instead of the app.
  - I'll detect when the app comes back without a session, and show "Google sign-in didn't return to the app. Use email + password here, or sign in with Google in Safari."
  - The real behavior needs a check on your iPhone.

## 3. Claude artifact version: automatic, no login page
The artifact can't reach Supabase, because its security rules block other sites. It already knows who is signed in to Claude, so it uses the artifact's own storage:
- the `user` capability for the player's id;
- the `db` capability, writing one private document per player at `data/users/<id>/save`, which only that player can read.

It shares the same `Cloud` sync rules through a second storage adapter. The Account button there just says "Saved to your Claude account". Republish with `capabilities: {room:{}, db:{}, user:{}}`.

## 4. Files
- `index.html`: Account button and screen, the `Cloud` module with the Supabase and Claude-db adapters, `persist()` hook, CSS.
- `sw.js`: bump `VERSION`. Leave Supabase API calls out of the cache, so only same-origin files and fonts are cached.
- `tests/e2e.js`: account tests (below).
- `README.md`, `PLAN.md`: accounts section.

## Verification
- **Browser tests with a stand-in Supabase.** The library request is intercepted and served a stub client:
  - create account → save uploaded;
  - second "device" with a different cloud save → the keep-which choice appears, and the chosen one is applied;
  - newer save wins on restart;
  - log out keeps local progress;
  - a wrong password shows the error;
  - guest play makes no network calls.
- **Claude-db adapter test:** a stand-in `claude.use('db'|'user')` gets saved to and loaded from.
- `node tests/engine.test.js` and the existing e2e suite stay green.
- **Real backend:** after the migration, `get_advisors` reports no RLS warnings. A SQL check confirms RLS is on and the 4 policies exist. If this session's network allows supabase.co, I run one real sign-up → save → read-back with a throwaway account, then delete it. Otherwise you test on your phone: create an account on the iPhone app, play, then log in on a computer and see the same progress.
- Push to the PR #1 branch, so merging it ships accounts too, and republish the artifact.

---

# (Previous) Plan: Border Desk v2 features

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

## Next: get the game onto GitHub Pages
The Pages URL is https://dave098-1.github.io/passport-control-game/. It serves `main`, and the game is still only on `claude/relaxed-euler-h7n9ce`.
1. Open a pull request from `claude/relaxed-euler-h7n9ce` into `main`, with a short summary of v1 + v2. First check the repo for a PR template.
2. The user merges it on GitHub.
3. Pages source must be "Deploy from a branch → main → / (root)". After a minute or two the link shows the game.

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
