# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

---

## #108 Listening Sessions and Play History (2026-11-08, branch `feat/108-sessions-history`)

**Goal:** a record of who listened to what with the Bot, visible only to the people who were there, and the most-played lists to start from when nothing plays.

**Shipped:**
- **Data:** `listening_sessions` (tracks and participants embedded, `participant_ids`, a generated `search_text` of names and titles), `play_history` (guild-user, user and guild rows), `record_play()`. RLS on; only the secret key reads or writes.
- **Bot** (`apps/bot/src/history/*`):
  - One session per Guild, from the first track until the Bot leaves voice. Participants are the room's non-bot members at each track start plus remote requesters.
  - Each change goes to `listening-sessions.json` first. A new or ended session is saved at once; other changes are written behind within 5 minutes. A session's saves run in order, and a failed save is retried.
  - A restart ends the sessions left active, at the restart time, and announces them.
  - A track Queue Recovery restores is not a new play. A Player Lavalink took down keeps its session.
  - Every track start records a play with `isMusic`/`isVideo` from `classify()`.
- **Backend:** `GET /api/sessions[?q=]` and `/api/sessions/:id` are for participants only; anyone else gets a 404. `GET /api/history/top?scope=me|guildId=` (the Guild's list is for members only). `session:update`/`session:end` carry the summary plus the newest track and go to participants' user rooms only.
- **Dashboard:**
  - `/sessions`: a Row list with the Live badge and search.
  - `/sessions/[id]`: a sticky header and replay through Select Server.
  - Top-played (mine and the server's) on the idle guild page.
  - The "ประวัติการฟัง" nav item.

**Validated:**
- `bun run verify` exit 0: bot 196 (incl. the recorder, history, store contract and music hooks), backend history e2e 5/5 (AC2: a Guild member who was not a participant gets no event and a 404), shared `trackKey` (AC3).
- `bun run e2e` 31/31, including `e2e/sessions.spec.ts`: AC5 (live, replay, live end) and AC4 (top-played plays on click).
- Red first: ordered saves, the recovered flag, the restart announcement, small events, and the Node-down session. The recorder and history unit tests for the recovered flag were written after the code.
- Screenshots at 1280 and 390 px.

**Not done here:** in #130 — session tracks as rows (24/7 growth), retrying a failed play, two Bot processes on one database, and the spec #88 SWR cache and collapsing header. The admin `activeUsers` stream belongs to #111. Real Discord/Lavalink are untested (#121).

## #107 Library: playlists, import, Likes (2026-11-08, branch `feat/107-library`)

**Goal:** each signed-in user has their own playlists and Likes, can play them into a Guild, and sees a change live in every tab they have open.

**Shipped:**
- **Data:** `playlists`, `playlist_tracks`, `likes` (Supabase, RLS read-own, writes only through the Backend). `replace_playlist_tracks` swaps a track list in one transaction.
- **Backend:** `/api/library/playlists[/:id]` (owner only; another user's playlist is a 404), `POST /api/library/import` (Spotify or YouTube playlist link → spec #71 preview, Spotify album and added-at), `/api/library/likes`. `library:update` goes to the user room. A 5000-track playlist saves and reads back whole (4 MB JSON limit; reads page past PostgREST's 1000-row cap).
- **Dashboard:** `/library` (grid, create, import with the supplied LatticeLoader), `/library/[id]` (rename, reorder, remove, play all from the source playlist, play one, delete), `/library/liked`. The supplied PulseHeart on Catalog rows, the queue, Now Playing and Library rows, from one likes store per signed-in user.

**Validated:**
- `bun run verify` exit 0 (backend library e2e 11/11).
- `bun run e2e` 29/29, including `e2e/library.spec.ts` 4/4: import, rename and reorder followed by another tab, play all, delete; like/unlike into Liked; an app-made playlist with play-all off; a second user on the same tab not seeing the first user's likes.
- Red first for the review fixes: 1000 of 5000 tracks came back; a second user saw the first user's heart; a malformed id answered 500.
- Screenshots at 1280 and 390 px.

**Not done here:** play-all of the *saved* tracks (needs a multi-track play command), atomic create, import rate limit, shared Button/useModal, PulseHeart's server-wide count, the stale "primary = ink fill" DESIGN.md row: all in #128. Real Spotify and Lavalink untested (#121).

## #106 Guild Settings: Bot Owner, Music Channel, outfit, notifications (2026-11-08, branch `feat/106-guild-settings`)

**Goal:** per-Guild settings that only the Server Owner or Bot Owner can change, enforced on the server and live in every tab; the Bot Avatar's outfit everywhere; now-playing notifications.

**Shipped:**
- **Data:** `guild_settings` (Supabase, RLS on, kept after the Bot leaves). The shared schemas cover the outfit, the settings, partial updates, the view, and one row mapping.
- **Backend:** `GET`/`PUT /api/guilds/:id/settings`.
  - Any member may read; only the Server Owner or Bot Owner may write.
  - The Music Channel must be a text channel the Bot can post in.
  - A change publishes `settings:update` to Redis and to the guild room.
  - Bot Owner and the outfit now come with every summary, permission and live push. Reads are cached and degrade when Supabase is down.
- **Bot:**
  - On the first join, the Bot Owner is the audit-log inviter, else the Server Owner. A re-invite never changes it.
  - Posts the Thai welcome on joining.
  - Notices go to the Music Channel, falling back to the command's channel.
  - `/setchannel`: Server Owner or Bot Owner only, must be a channel the Bot can post in, creates the row if missing, and tells the Dashboard.
  - Every command is audited, and the 30 % promo runs.
  - Publishes its text-channel list for the picker. Reads settings from Supabase in both modes (the read carried over from #103).
- **Dashboard:**
  - The settings page: searchable picker, Bot Owner with copy ID, the explainer, and the outfit editor with the supplied SquishSwitch toggles.
  - `GuildAvatar` on the sidebar, Now Playing and the server list.
  - The supplied BellToggle for notifications.

**Validation:**
- `bun run verify` exit 0. `bun run e2e`: 25 passed.
- Red first:
  - shared schemas, including the partial-outfit merge (zod `.partial()` kept the defaults);
  - the Backend settings e2e, including the live-push blocker;
  - Bot module, inviter, welcome, audit and promo, `/setchannel` and its refusals, Music Channel routing and fallback, the registry text channels;
  - the Dashboard settings e2e (AC1–AC5).
- Characterization: the Supabase store contract.
- Screenshots: 1280 light and 390 dark. The bell overlapped the title at 390; it now sits in the normal flow.
- **Not run:** a real Discord audit log or system channel (#121); CI (#116).

**Lessons:**
- An optional parameter added to a shared function leaves every existing caller silently on the default. The gateway's live pushes reset the Bot Owner's control after every track change. Make the parameter required and let the compiler list the callers.
- zod `.partial()` on a schema with `.default()` still fills the defaults, so a "change only the hat" update reset the rest.
- Two fake Discord users with the same username but different ids make Supabase Auth link both identities to one account, which breaks sign-in for both. Every e2e user needs a unique username.

**Next:** #107.

---

## #105 Catalog search and browse on the Dashboard (2026-11-08, branch `feat/105-search-catalog`)

**Goal:** search four sources from the Dashboard, open artist, album and channel pages, and play into a chosen server, seeing why a server is locked.

**Shipped:**
- **Shared:**
  - `search.ts`: the search contract, the catalog page schemas, `topResult()` per v5 §7.2 (exact 1.1, track > artist > album, Dice within 0.1, minimums) and `diceSimilarity`.
  - `ttl-cache` and the Spotify client-credentials core move here from the Bot.
- **Backend:**
  - `SearchService` with four modes. `spotify-api` (the default) keeps v5's own top-result ladder. `spotify` uses `spsearch:` and falls back to `ytmsearch:`.
  - YouTube channels: `" official artist"` for YT Music, descriptions cut to 200, hidden subscriber counts returned as undefined, searches cached 30 min.
  - Pages: artist (TH top tracks, albums and singles, 20), album (every track, paged), channel.
  - `GET /api/me/play-permissions`.
  - ADR-0009: the Backend calls Lavalink's REST API directly. Every identifier is prefixed, so no URL is ever loaded (SSRF).
- **Dashboard:**
  - `/search`: source tabs, 250 ms debounce, ThinkingOrb, top result with match %, songs with source badge and VIDEO chip, artists, albums.
  - `/artist`, `/album`, `/channel` pages.
  - Select Server dialog, showing why a guild is locked.
  - Guild page Queue / Search tabs for quick-add.
  - One pill-tabs style and one `playInGuild` helper.

**Validation:**
- `bun run verify` exit 0. `bun run e2e`: 22 passed.
- Catalog e2e covers: search → artist → play into the chosen server with the locked guild's reason; the YT Music mode; the guild Search tab.
- Red first: scoring (6), service contracts per mode and pages, HTTP e2e, catalog e2e (3), and the review fixes:
  - `spsearch` prefix and fallback
  - `spotify-api` ladder
  - VIDEO chip
  - channel-search cache
  - album paging
  - SSRF: no bare URL reaches Lavalink
- Screenshots at 1280 px light and 390 px dark, with no horizontal overflow.
- **Not run:** real Spotify, YouTube or Lavalink (#121); CI (#116).

**Lessons:**
- A fake that accepts every input hides a missing prefix. The Lavalink fake answered prefix-less words, so the real node's empty answer and an SSRF path both passed. The review fix now models the node's behaviour in the test.
- Anything the server passes to Lavalink as an identifier is a URL fetch unless it is prefixed. The Backend needs the same guard the Bot has.

**Deferred:** "top-played when empty" in quick-add (#85) needs play history, which comes with the history slice.

**Next:** #106.

---

## #104 Track Resolution depth: playlists, pictures, icons, autocomplete, /cache (2026-11-08, branch `feat/104-track-resolution`)

**Goal:** playlists play whole and say where each track came from. Tracks show the right picture, the notice shows the configured icon, and the play commands suggest tracks.

**Shipped:**
- **Playlists (spec #3, #4, #65, #66):**
  - Every track is added, carrying its playlist (1-based index and total).
  - A YouTube Mix (`list=RD…`, but not `RDCLAK` albums) keeps its link and is named `สถานีวิทยุ…`.
  - Replies use v5's 📙/📝 lines; the notice shows `จาก: <name> (i/n)`.
- **Pictures (spec #48, #62–#64):**
  - `thumbnails.ts` classifies music vs video and upgrades thumbnails to maxres or hq, using parallel HEAD checks that skip internal addresses and don't follow redirects.
  - A playlist picture comes from Spotify or the page's og:image (upgraded), falling back to the first track's.
- **Icons (spec #67, #68):** modes come from env with v5's defaults; the artist image comes from Spotify (client credentials, token reused until 5 min before expiry); `USE_PLAYLIST_URL` is supported.
- **Autocomplete (spec #2, #69):**
  - The v5 §3 algorithm and strings, with an in-process TTL cache (30 min, ≤ 1000 entries) that works without Redis.
  - Only exact sentinel values are refused.
  - `/cache stats|clear` (ManageGuild).
- **Latency:** a track start publishes and posts its notice at once; the resolved picture follows as its own revision. Icon and playlist lookups are capped at 1.5 s and 3 s, and the autocomplete search at 2.5 s.

**Validation:**
- `bun run verify` exit 0: bot 168 plus shared, fake-lavalink, backend, fake-discord and build.
- `bun run e2e`: 19 passed.
- Red first: playlists (fake, engine, Mix rule, schema, replies, notice line); thumbnails; lookups; artwork; engine wiring; autocomplete and commands; the review fixes (sentinels, escaping, RDCLAK, anchored Mix rename, long values, og upgrade, SSRF guard, publish-before-art, display icon).
- Not red first: `ttl-cache` (written with its code); the engine autocomplete test and the `null`-artwork test (characterization; the fake has no artwork, so the latter cannot discriminate).
- **Not run:** real YouTube, Spotify or Lavalink (#121); CI (#116).

**Lessons:**
- A lookup awaited on the track-start path delays the realtime Dashboard by its worst-case timeout. Publish first, and let the picture follow as a revision.
- `x ?? fallback` makes a deliberate `null` ("checked, none") indistinguishable from "not looked up".
- Two engines on one Lavalink manager in a test both react to every event. Tests that build their own engine must stop the `beforeEach` one first.

**Follow-up (not built):** a 5,000-track playlist puts its metadata in every Player State publish and snapshot write. Cap or summarise the published queue if that shows up in #121.

**Next:** #105.

---

## #103 Resilience: 24/7, Queue Recovery, voice-drop recovery, Standalone (2026-11-08, branch `feat/103-resilience`)

**Goal:** the Bot survives a restart, a voice drop and a missing Redis without losing the music; 24/7 keeps it in voice.

**Shipped:**
- **24/7 / Idle Player:**
  - Spec #10, #27: queue end leaves voice, unless 24/7 is on; then the Player stays as an Idle Player, published with `current: null`.
  - `/skip` on the last track defers to the same rule.
  - `/247` command with v5's replies.
- **Queue Snapshot + Queue Recovery** (spec #21, #35, #123):
  - `apps/bot/src/music/queue-snapshot.ts`: one file per Guild, writes ordered per Guild, unique temp file then rename.
  - Written on every publish, every 10 s, and on SIGINT/SIGTERM.
  - Restored from Lavalink's `encoded`, 5 s after every node connect (`main.ts`).
  - Cleared when the Player leaves, but **not** when Lavalink destroys it (`NodeReconnectFail`).
  - `recovering` flag on Player State, plus a recovery notice instead of Now Playing.
- **Voice-drop recovery** (spec #28):
  - Triggers on codes 4006/4009/4014/4015 or `byRemote`: reconnect, seek back on the same track only, resume.
  - Guild events `voice:disconnect|reconnected|reconnect-failed`, relayed (not cached).
  - Dashboard status line.
  - Fake Lavalink `closeVoice`.
- **Standalone:** plays and recovers without Redis. The direct Supabase settings read moved to #106 (no settings table yet; ADR-0003 note).

**Validation:**
- `bun run verify` exit 0, twice: shared 55, fake-lavalink 7, bot 115, backend 39, fake-discord 3, build.
- `bun run e2e`: 19 passed.
- Red first:
  - 24/7 engine tests and `/247`
  - snapshot store, including concurrent saves (ENOENT before)
  - restart restoring queue, current track, position and 24/7
  - Lavalink failure keeps the snapshot
  - restore never writes `current: null`
  - `/play` during a restore waits
  - each recoverable close code, plus remote, non-recoverable and paused cases
  - skip, leave and a double drop during a reconnect
  - Dashboard: Idle, recovering and voice-status e2e
- Characterization (passed first): the Standalone recovery test.
- **Not run:** CI (#116); real Discord or Lavalink (#121).

**Lessons:**
- lavalink-client destroys every Player when the node gives up reconnecting. Anything keyed on `playerDestroy` must look at the reason.
- Two tests that share Redis can't both treat the keyspace as theirs. The bot's sweep test wiped the Backend e2e's state when `verify` ran them in parallel (the `player.e2e` failure).
- Drawn-only socket events aren't cached, so an e2e must resend them until the tab is in the room.
- Same-key siblings in React (`key={track.uri}` on two elements) render a duplicate as soon as a conditional sibling is inserted.

**Next:** #104.

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
