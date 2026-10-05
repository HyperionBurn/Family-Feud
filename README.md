# hello, world! Family Feud

Host-led Family Feud for the GDG on Campus UOBD event *hello, world!* (Tue 6 Oct 2026, Innovation Lounge, room 0201), in the Blue Ice theme.

**How it is played (agreed with the tech lead, 4 Oct):**
- Two teams come to the front, and Salena and Manahil present.
- The club's standalone physical buzzers settle the face-off; the presenters judge it.
- Team members answer out loud.
- One person (Hussain) runs the laptop: they reveal answers, record wrong answers and keep score.

The app has two screens, a private **moderator console** and a public **projector board**. Phones are optional: an off-by-default phone-buzzer mode gives one paired phone per team, pending Rayyan's final decision. Team size never depends on phones.

**Status: playable and tested in a browser simulation; not yet event-ready.**
- The survey results arrive on the evening of 5 Oct, so only the three clearly labelled demo questions have been played.
- No venue projector, venue Wi-Fi, speakers or real buzzer phones have been tried.

See [Verification](#verification).

## Quick start

Needs Node and pnpm (built and tested on Node 24.16, pnpm 12.6, Windows 11).

```bash
pnpm install
pnpm run dev
```

1. Open `http://localhost:5173/host` on the laptop.
2. Click **Open projector**, drag that window to the projector and click **Fullscreen**.
3. Click **Enable sound** on the projector.

The console's header shows whether the projector is open and whether its sound is on.

| Command | What it does |
|---|---|
| `pnpm run dev` | Relay on `:4000` + Vite dev server on `:5173` (the LAN address is baked in for phone mode) |
| `pnpm run build` | Typecheck and production build to `dist/` |
| `pnpm run serve` | The Render server: relay and built game on one port (`PORT`, default 4000); run `pnpm run build` first |
| `pnpm test` | Unit tests |
| `pnpm run typecheck` / `pnpm run lint` | Types and lint |
| `pnpm run e2e` | A complete physical-buzzer game with the relay unreachable (needs `pnpm run dev` and Chrome) |
| `pnpm run e2e:guide` | The quick guide: offer, Skip, replay, keyboard, no effect on the game |
| `pnpm run e2e:phones` | Phone buzzers: two phones, pairing, a full face-off, an impostor, stale and duplicate presses, a drop |
| `pnpm run e2e:faceoff` | Face-off rules: taps, corrections, misses, the hosts' call, play or pass, skipping |
| `pnpm run e2e:failures` | Relay down, storage failing, rejected import, answer editor, preview, projector sound, odd URLs |
| `pnpm run e2e:extras` | A level game, the tie-break round, the countdown timer |
| `pnpm run e2e:paste` | Pasting survey rows from a spreadsheet |
| `pnpm run probe` | Raw-socket checks of the relay (room limit, role spoofing, host takeover) |

Windows notes:
- `pnpm-workspace.yaml` allows esbuild's install script.
- `scripts/dev.mjs` replaces the stock `air-jam-server dev`, which fails on Windows. The upstream command is kept as `pnpm run dev:sdk`.

Keep one `/host` window per browser. A second one shows a warning.

## Running the game

**First visit:** the console offers *New here? Learn the controls in about a minute.* That is five small popovers over the real controls; **Skip** is remembered on that laptop. **Quick guide** in the header replays it at any time, and it never starts on its own during a game.

The console has two screens:
- **Live**: the game itself.
- **Setup**: survey results, buzzer choice, projector check, backups. Visit it before the event.

During a round the console shows:
- the question, large;
- one box saying **what happens now**, with the buttons for it;
- every private answer with its points and a **Reveal** button;
- **Wrong answer** (`X`) and **Undo** (`U`), always at the bottom;
- scores, round points and strikes on the right, with **Adjust score** for penalties and corrections;
- a small copy of the audience screen, which you can collapse.

Keys: `1`–`9` and `0` reveal answers 1–10, `X` wrong answer, `U` undo. Keys do nothing while you are typing in a box.

1. **Live**: type the two team names and press **Start** on a question (Question 1 to 16; a question without results says *No results yet* and can only be previewed).
2. **Show the board** once the presenters have read the question.
3. **Start the face-off.**
   - Tap **Team X buzzed first** for whichever buzzer the presenters name. A buzz only decides who answers first.
   - Press **Reveal** if their answer is on the board, or **Wrong answer** (one red X, no strike).
   - If the first answer is not the top one, the other player answers too.
   - Then record the presenters' decision with **Team X wins the face-off**. The console shows what the survey suggests (*By the survey, Team A wins: Team A found the top answer*), but the presenters decide and can overrule it. **Hosts already decided?** and **Wrong call?** cover the rest.
4. Choose **Team X plays** or **Team X passes**.
5. The team answers out loud, one by one. Press **Reveal** for a match (the tile flips over on the projector, with a bell). Press **Wrong answer** for a miss (a big red X and a buzzer).
6. The third wrong answer opens the **steal**: the other team gets one guess. **Reveal** if it is right (they take the round), **Wrong answer** if not.
7. **Give N points to Team X** (once), then **Next question**. Reveal the rest for fun afterwards; it never changes a score.
8. After the last round the projector shows the winner. **Set up the next two teams** clears the names and scores and keeps the answers. Questions already played are tagged *Used in an earlier game* so the next pair gets fresh ones.

Also available:
- **Skip the face-off**, then pick who plays first.
- **End round early.**
- **Timer** (5 to 30 s, advice only; it ends by itself or when anything happens).
- **Play a tie-break round** when a game ends level.

House rules (proposed, not set by the organisers):
- Three rounds per game by default (Setup).
- Three strikes and one steal.
- Face-off answers count once, in the round's points, for whichever team ends up playing.
- A repeated answer shows ALREADY ON THE BOARD and costs nothing.
- Undo restores the previous state exactly. An answer the room has seen cannot be hidden again.

### The projector

- Answers flip over with a bell.
- Every wrong answer shows a large red X with a harsh buzzer (red is used only for wrong answers and strikes).
- Short banners mark play or pass, the steal and the points awarded; the final screen names the winner.
- Each effect plays once per accepted action. Nothing replays when the projector reloads or reconnects, or when the console undoes something, and scores never wait for an animation.
- With reduced motion the tiles turn over instantly; **QUIET** on the projector's control bar stops all sound and animation.
- All sounds are original and synthesised in the browser: no samples, nothing taken from the TV show.

Browsers only allow sound after a click in that window. So the projector opens with *Sound is off until you click here*, and the console warns until it is on. The projector bar has Test sound, Mute, Volume, Music and Fullscreen, and Setup → Projector can play a test sound from the laptop.

### Phone buzzers (optional, off by default)

Rayyan has not yet decided between physical and phone buzzers, so this mode is built but off. **Setup → Buzzers → Phone buzzers** turns it on:

1. One player per team opens the join address on their phone (the projector shows a QR code until both teams are paired).
2. Each phone holder types their team's **4-digit code**. The codes are shown only on the console, so read each code to its own team only.
3. During the face-off press **Open phone buzzers**. The first press counts and becomes the same "Team X buzzed first" a tap makes. The other phone shows *Locked out*.

**Reset and reopen** handles a dispute, and the tap buttons still work as the presenters' override. **New code / Unpair** forgets a phone. **Set up the next two teams** always makes new codes, so the last pair's phones control nothing. Switching back to physical buzzers keeps the game and discards any press still in flight.

Honest limits:
- **Timing:** the projector says *RECEIVED 0.84 S AFTER THE BUZZERS OPENED*. That is when the press reached the laptop, including network delay. It is arrival order, not proof of who physically pressed first. Times from different phones are never compared.
- **Impersonation:** the Air Jam relay tells every phone in a room the controller id and device id of every other phone, and a phone presenting both can take over that seat. Tested: a third client did exactly that.
  - The pairing token blocks it from buzzing. Only the phone that typed the team's code gets the token, and every press needs it, so the impostor's presses were all refused.
  - It does knock the real phone offline. The fix is **Unpair**, then pair again with the new code: about ten seconds.
  - Ten wrong codes lock pairing until you make new codes.
  - Using phone mode at the event is Hussain's and Rayyan's decision.
- **Drops:** a dropped phone shows as disconnected after about 8 seconds (the relay's grace period, lowered from its default 30 s in `scripts/dev.mjs` and `scripts/serve.mjs`). The presenters then judge that face-off and you tap.
- **Phone refresh:** a phone that refreshes forgets its pairing (it holds it in memory only) and pairs again with a new code.

## Arcade hub mode (optional)

This fork can run as a game inside the multi-game arcade hub (`airjam-rocket-arena`, `apps/arcade-hub`): players join the hub once, vote on the game, and the result lands on the hub's leaderboard. **Nothing changes unless the hub launched the page** (`?arcade=...&round=...&token=...&players=...` on the URL), so standalone use is exactly as above.

How it fits a host-led game:
- The hub's big screen embeds the **projector** (`/screen/local`). The hub opens the **console** (`/host`) in a second window it controls, so both pages share one browser partition and the existing projector channel keeps working.
- The hub's players are split into two teams (stable for the round; sizes differ by at most one) and the team names are filled in. The console shows who is on which team and can still rename them.
- Survey results are stored per browser **and per embedding page**: load them once from Setup inside the hub-launched console (or restore a backup there). They do not carry over from a console opened directly at this address.
- When the game is over the console shows **Send the result to the arcade**. Nothing is sent automatically, so the final projector screen can be enjoyed first. A level game can be sent as a draw or played on with a tie-break first. The winning team shares first place; points and the leaderboard are the hub's.
- Questions an earlier hub round used stay marked as used.

Code: `src/arcade/` (`launch.ts` pure and tested in `tests/arcade.test.ts`, `session.ts`, `ArcadeBar.tsx`), plus small hooks in `useHostGame.ts`, `HostConsole.tsx`, `ScreenPage.tsx` and `persist.ts`.

## Survey data

The 16 supplied questions are fixed (`data/templates/event_questions.pending.json`). Real answers are never committed or bundled; they live in the moderator's browser storage only.

Ask the events team for one row per answer: **question number, answer, number of students who said it**, plus an optional column of other wordings to accept. Then use **Setup → Survey results**:

- **Paste results from a spreadsheet** (the fast way):
  1. Paste the rows (or choose a CSV).
  2. Click **Check these rows**. Errors are listed by line and nothing changes.
  3. Read the preview.
  4. Click **Load these results**.

  Questions already loaded stay unless you paste them again, and the previous answers are kept as a recoverable copy.
- **Type or correct one question's answers**: the answer editor.
- **Advanced: import a pack file (JSON)**: the bundled structure.

The validator refuses bad data with specific errors and leaves the current game alone:
- wording must match the supplied questions;
- 1–10 answers per question;
- counts must be positive whole numbers, never scaled to 100;
- duplicate labels and conflicting aliases are flagged.

All text renders as plain text.

`data/demo/demo_pack.json` holds invented practice answers for Questions 1, 3 and 10, ready for the rehearsal. **Load demo pack** shows **DEMO: INVENTED RESULTS** on the console and projector (and on buzzer phones), and the demo pack cannot be relabelled as real.

## Saving and recovery

| Situation | Behaviour |
|---|---|
| Console refresh | Offers **Resume the game**: question, reveals, scores, strikes and points given. The quick guide never interrupts it. |
| Projector reload | Asks the console for the latest board. Nothing is scored twice and no effect replays. |
| Relay or internet down | Physical mode needs neither: board, scores, effects, saving and projector all run on the laptop. Phone mode says plainly that phones are offline. |
| Browser storage fails | **Not saved** in the header plus a warning. The game continues in memory, and **Setup → Export private backup** still works. |
| Wrong click | **Undo** (`U`). Penalties and corrections via **Adjust score** are undoable too. |

Export a private backup before the event (**Setup → Backup and recovery**) and keep it out of the public repository.

## Architecture

One authority: the moderator page. It owns the pieces below, and the public view is built by an allowlist (`src/public/project.ts`) and sent to the projector over `BroadcastChannel` and, in phone mode, to buzzer phones through the Air Jam store.
- the rules engine (`src/engine`): a pure reducer with explicit phases, per-action ids (a repeated delivery is a no-op) and undo;
- the answers;
- saving;
- the phone-buzzer rules (`src/buzzers`, pure).

- The only network actions are `pairBuzzer` and `buzz`. Both refuse calls stamped as the host (the relay lets a phone spoof that channel), take the team from the console's pairing rather than the payload, and are refused outright in physical mode. Nothing on the network can reveal, score, award or reset (`tests/store.test.ts`).
- `src/ui/ScreenView.tsx` renders both the projector and the console's preview. The preview never plays sound; the red X and banners are drawn by the projector page only.
- The projector and buzzer phones never import the answer pack, host storage or the console (`tests/boundaries.test.ts`).
- Air Jam `@air-jam/sdk` and `@air-jam/server` 0.9.2.
- The crowd-assist poll from the first version was removed on 5 Oct after the tech lead's feedback. It remains in git history before commit `3ea5cea`.

## Deploying

Deployed by Hussain at `https://gdg-family-feud.onrender.com` (Render free plan, `render.yaml`, `scripts/serve.mjs`: relay and game on one port). Every push to `main` redeploys. The 5 Oct changes (simplified console, game-show effects, quick guide, optional phone buzzers) were pushed to `main` on 5 Oct; the pre-change version is tagged `pre-feedback-2026-10-04`.

- **The free plan sleeps** after about 15 minutes idle (30–60 s to wake) and loses rooms on restart. Open it 10 minutes early. A paid instance for the day is a club spending decision.
- **Results stay in the browser, per address.** Results pasted at `localhost:5173` are not at the Render address, so load them where you will play and keep a backup.
- **Authentication is off.** The relay runs with Air Jam app authentication disabled (`AIR_JAM_AUTH_MODE=disabled`), so anyone with the address can open their own empty console. The real answers live only in the operator's browser.
- **Offline fallback:** physical mode works with no internet once the page is loaded. `pnpm run dev` on the laptop is the offline fallback.

## Verification

Ran on 5 Oct 2026, Windows 11, headless Chrome via `playwright-core`, against `pnpm run dev`.

**Run and passing:**
- `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (111 unit tests) and `pnpm run build`.
- The browser suites (results below).

| Suite | Checks | Covers |
|---|---|---|
| `e2e` | 46 | A complete physical-buzzer game with every realtime connection refused: face-off with the hosts' call, pass, reveals, three wrong answers (X, XX, XXX, then the steal banner), a missed steal, points, penalty and Undo, a projector reload, a console refresh and Resume, finishing, the next two teams. It also checks that nothing sent to the projector ever held an unrevealed answer, and that each effect fired once. |
| `e2e:guide` | 28 | First-visit offer, Skip remembered, Done, replay, Escape, Tab kept inside, focus returned, popovers inside 1366×768. Mid-round, keys and clicks change nothing and the projector's revision never moves; no offer during a resumed game. An empty autosave still gets the offer. |
| `e2e:phones` | 40 | Two phone pages pair with codes, the first press locks, the other phone is locked out, honest timing labels, reset, a double tap counted once. An impostor takes a seat but is refused, as are host-channel spoofs, stale, duplicate and unpaired presses. Also: a drop shown in 8 s, switching to physical, next teams. |
| `e2e:faceoff` | 27 | Taps, corrections, misses, both missing, the hosts overruling the survey, play or pass, skipping |
| `e2e:failures` | 32 | Relay down, storage failing, rejected import, editor, preview, projector sound status, odd URLs |
| `e2e:extras` | 16 | Tie-break, timer |
| `e2e:paste` | 8 | Spreadsheet paste |

**Also checked by hand, through scripts:**
- A layout scan of every tab and round state (including ten answers and the guide) at 1366×768 and 1920×1080, at 100% zoom: no overflow, and Wrong answer and Undo reachable without scrolling.
- The tile flip measured in the running projector: 0°, 111°, 163°, 177°, then 180° over about 450 ms, and an instant swap with reduced motion.
- The red X shows for about 1.1 s.

Screenshots are in `docs/screenshots/`: `before-*` for the old console, `after-*`, `physical-*`, `guide-*` and `phone-*` for the new one.

**Not run** (needs people, devices or the venue):
- real phones on venue Wi-Fi (phone mode was tested with emulated phones and raw sockets on this laptop);
- the speakers, and anyone listening to the sounds;
- the venue projector, legibility from the back;
- the real standalone buzzers with the presenters;
- Safari or Firefox;
- a screen reader;
- whether someone new learns the console in about a minute. That is a goal to test at the rehearsal, not a result.

## Before the event

Work through [`docs/OPERATOR_CHECKLIST.md`](docs/OPERATOR_CHECKLIST.md).

## Third-party material

Blue Ice values match the club guide (checked 4 Oct 2026). From `UdayAhuja19/gdg-resources`:
- `src/styles/blue-ice.css` (font paths edited);
- `src/styles/blue-ice-club.js` (unmodified; draws the wordmark);
- `public/brand/gdg-mark-*.svg`.

Fonts are Archivo and DM Mono under the SIL Open Font License (`public/fonts/`), served locally.

## Layout

```
src/engine/    rules reducer, phases, undo          src/public/   public snapshot, channel, projection
src/content/   canonical questions, validation      src/buzzers/  phone-buzzer pairing and presses (pure)
src/host/      console, guide, saving               src/game/     the Air Jam store (public state + buzzer calls)
src/screen/    projector page, effects              src/play/     join page, buzzer phone
src/ui/        shared renderer, sound, stage        scripts/      launcher, server, relay probe, e2e runs
```
