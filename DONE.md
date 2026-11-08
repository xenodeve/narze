# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

---

## #102 Queue management from Discord and the Dashboard (2026-11-08, branch `feat/102-queue-management`)

**Goal:** edit the queue from both sides (move, remove, clear, play-now, /playnext, /playat, /playqueue, /skipplay, /queue pages), with every tab converging on the server's order.

**Shipped:**
- **Contract:** `move` / `remove` / `playNow` carry the track's `uri`. The Bot checks it synchronously before the change and answers `stale` when the queue moved under the index. `queue:jump` is relayed so the Dashboard animates the row out before the update (spec #39). One edit is exactly one Queue Revision: an edit that starts a track lets the track start do the bump.
- **Shared:** `moveTrack` (spec #46 semantics) and `reducePlayer`, which replaces the ad-hoc reconcile in `use-player`.
- **Bot:** /queue with an invoker-only pager that re-counts pages per click; /clear, /loop, /playnext, /playat (autocomplete), /playqueue (choices are `<position>|<uri>`), /skipplay; titles in Discord markdown go through `trackLink` / `escapeText` (`apps/bot/src/music/format.ts`).
- **Dashboard:** `QueuePanel` with stable keys, optimistic edits that revert on refusal or time out, reorder by pointer (captured, cancel-safe), by keyboard (announced), swipe-to-remove on touch (the supplied `SwipeRow`), clear with a confirm dialog.

**Validation:**
- `bun run verify` exit 0: shared 54, fake-lavalink 6, bot 88, backend 39, fake-discord 3, build.
- `bun run e2e`: 14 passed, then the queue spec 3 passed with the new pointer-drag test; that test was proved red by deleting the `pointercancel` listener.
- Bot tests assert `revision === before + 1` after play-now and /skipplay (red at +2 first), and that a stale uri leaves the queue untouched.
- Screenshots: queue panel at 1280 light and 390 dark.
- **Not run:** CI (#116), real Discord (#121).

**Lessons:**
- An index is not an identity: any edit that crosses a network names the item it means.
- The earlier unexplained `verify` exit 1 was the Fake Lavalink test ending before lavalink-client's auto-advance request landed (ECONNRESET between tests); reproduced 4/4, gone 5/5 after the test waited for the next track start.
- A synthetic `pointerdown` cannot be captured (`setPointerCapture` throws), so a drag test built from dispatched events passes vacuously; drive the real mouse.

**Next:** #103.

---

## #101 Dashboard control with server-side Control Permission (2026-11-08, branch `feat/101-dashboard-control`)

**Goal:** control playback from the web, with the permission ladder enforced on the server even for a direct socket call, live permission changes, a voice-channel picker and optimistic UI that reverts.

**Shipped:**
- **Contract:** `player:command`, which fails closed. The token is re-verified per command, with the tab's current token. The command must target a Mutual Guild and pass the ladder, then is relayed over Redis with the Acting User and paired with the Bot's result by id (ADR-0008).
- **Live permission:** `permission:update` is sent after every voice or Player change.
- **Bot:** a command bus; previous, loop, shuffle and play-next; the Spotify oEmbed fallback (#70); and a public voice-channel list, debounced.
- **Dashboard:** the controls (volume sends on release, seek is drag-safe), a lock that shows the reason, the picker, and the app shell with the supplied `BranchedMenu` (#76).

**Validation:**
- `bun run verify` exit 0: 158 tests.
- `bun run e2e` 12 passed: two users, one allowed and one refused; the controls turn on within 2 s of joining voice; a refusal reverts; the picker starts playback in the chosen channel.
- Mutation probe: removing the server check turned the backend e2e red.
- Screenshots: 1280 and 390, with the stage laid out by a container query.
- **Not run:** CI (#116), real Discord (#121).

**Lessons:**
- A socket verified only at handshake outlives its token.
- socket.io-client never reconnects after the server closes the socket.
- Anything a server sends to "every member" has to respect Discord channel visibility.

**Next:** #102.

---

## #100 Play from Discord, read-only Now Playing, Hot Cache (2026-11-08, branch `feat/100-play-and-now-playing`)

**Goal:** `/play` and the core commands drive Lavalink; every change reaches every open Dashboard tab within 1 s, and a page load never asks the Bot.

**Shipped:** `apps/bot/src/music/*` (lavalink-client engine: self-deafened join, volume 15, Now-Playing rule for every spec case, stale re-resolve, Queue Revision, per-Guild /play lock, best-effort publishing), eight slash commands with v5 strings (`commands/*`, `/play` deferred), Player State + summary on Redis with an epoch and seek stamp, sweep on ready; Backend Hot Cache (`PlayerCache`, ADR-0006) and `GET /api/guilds/:id/player`; Dashboard `/guilds/[id]` Now Playing (crossfade, title swap, `progressAt` per frame, Aurora from mood, Bot Avatar), Up Next, member counts, guild selection; Fake Lavalink playback; LavaSrc market TH from env.

**Validation:** `bun run verify` exit 0 (131 tests incl. lavalink-client against Fake Lavalink + real Redis); `bun run e2e` 9 passed (two tabs within 1 s; reload renders from the Hot Cache after the Redis key is gone; progress forward); mutation probes on volume, self-deaf, first-track flag, stale re-resolve and publish all red; real Lavalink 4 container: `ytmsearch:` resolves, LavaSrc loaded. **Not run:** real playback in a Discord guild (no token — acceptance box left open), Spotify search (no credentials), CI (#116).

**Lessons:** stopping the Lavalink container during its first plugin download leaves a corrupt jar (`zip END header not found`); `--force-recreate` fixes it.

**Next:** #101.

---

## #99 Discord sign-in, Mutual Guild list, Presence (2026-11-08, branch `feat/99-discord-login`)

**Goal:** sign in with Discord in a popup, list only the servers shared with the Bot with live badges, and count open tabs — with identity established by the Backend, never by the client (v5 trusted `req.body.user.discordId`).

**Shipped:** Supabase Auth (Discord, PKCE, popup + full-page fallback); `Authenticator.verify` via `auth.getUser` on every call; Discord ID only from `identities` and only for Discord-only accounts; `POST /api/me/sync` (provider token must be the caller's; 502 keeps the snapshot) and `GET /api/me/guilds`; `public.users` / `public.user_guilds` + RLS + `replace_user_guilds`; socket handshake auth, Mutual Guild rooms, live `guild:summary`; ref-counted Presence; Bot mirrors guild set + voice states to Redis; `controlPermission()` in shared; `packages/fake-discord`; `bun run infra:up`; email sign-up disabled; ADR-0005.

**Validation:** `bun run verify` exit 0 (65 unit/contract tests against real Redis, Supabase Auth and Postgres); `bun run e2e` 6 passed (popup sign-in, live badge, sign-out refuses the old token, popup-blocked fallback, forged state, forged code); mutation probes on the token-owner check and the Presence edge both went red; screenshots at 1280 light and 390 dark. **Not run:** real Discord (no credentials), CI (#116). **Deferred:** see the scope-notes comment on #99.

**Lessons recorded:** [[supabase-auth-fake-discord]].

**Next:** #100.

---

## #98 walking skeleton (2026-11-08, PR #115 → `v7` 9bf09367)

**Goal:** prove the whole Bot → Redis → Backend → Socket.io → Dashboard path once, on the v7 monorepo.

**Shipped:** Bun workspaces (`apps/bot`, `apps/backend`, `apps/dashboard`, `packages/shared`,
`packages/fake-lavalink`); Runtime Mode detection; heartbeat (2 s, TTL 4 s, expiry on the Backend's
clock); `StatusGateway` + `CorsIoAdapter`; Strata-xeno landing with `BotAvatar`; ADR-0004, ADR-0007;
`infra/lavalink/application.yml`; `supabase/config.toml`; repo-wide LF.

**Validation:** `bun run verify` exit 0 (36 unit/contract tests); `bun run e2e` 2 passed ×3 with the
real Bot process; T4 gate full suite in a fresh worktree before merge; Lavalink booted with both
plugins and reported 4.2.2 on `/version` (the compose tag `:4` floats, so a later pull may differ). **Not run:** CI (billing lock, #116), `supabase start`.

**Lessons recorded:** [[bun-tsconfig-follows-cwd]], [[windows-toolchain-gotchas]], ADR-0004 (closeOnError on Bun).

**Next:** #99 (Discord login, server list, presence; ADR-0005).

---

## No-CI mode (2026-11-08, PR #117 → `v7` 46b8f37e, issue #116 open)

**Goal:** keep merges verifiable while GitHub Actions cannot start jobs (billing lock).

**Shipped:** gate `verify` = install + verify + e2e; `pre-push` message corrected; AGENTS.md / workflow.md
no-CI rules; impact-register entry. **Validation:** gate simulated in a fresh worktree without Bun on
PATH, exit 0. **Next:** developer fixes billing → restore per #116.

---

## T4 bootstrap of the v7 rewrite (2026-11-08, /t4-project-bootstrap, branch `v7`)

**Goal:** install the T4 operating layer (memory, workflow, hooks, CI, guards, records) on the fresh
`v7` branch before any v7 code exists, so every later session starts on the rails.

**Shipped:**
- `.claude/` — `t4.json` marker (`"verify": "bun run verify"`), `settings.json` hook wiring, `hooks/` scripts, `using-t4.snapshot.md`
- `.githooks/` — `pre-push` + `check-issue-ref` / `check-tree-budget` / `check-gate-ledger`
- `.github/` — `workflows/t4-verify.yml`, `t4-e2e.yml`, `t4-codeql.yml`, `dependabot.yml` (all on `v7`)
- `docs/agents/*`, `docs/adr/README.md`, `docs/reports/*`, `docs/superpowers/*`, `docs/OPEN-WORK-LEDGER.md`, `Obsidian-Narze/`
- root `package.json` (placeholder scripts), `.gitignore`, `.gitattributes`, `AGENTS.md` rewiring, `CLAUDE.md` (`@AGENTS.md`)

**Validation:** `bun run verify` exits 0 (placeholder scripts only — no workspace code yet). Hook
files byte-compared against the skill references. CI not run (branch not pushed).

**Next:** ruleset after first push (ledger Track 2); parity spec (ledger Track 1).

---
