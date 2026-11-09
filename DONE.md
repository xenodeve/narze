# DONE — Agent Session Log

> Newest entry on top. One dated `##` heading per shipped unit so an agent can jump to one.
> When this crosses ~a few hundred lines or a phase closes, move older entries to
> `DONE-archive-<period>.md` and leave a redirect line here.

---

## #164 The search's match percentage is measured (2026-11-09, branch `fix/164-real-score`)

**Goal:** the developer: "อยากให้คำนวนใกล้เคียงจริง ไม่เอา mockup". The full-system test showed a nonsense YouTube query's top result as "ตรง 90%".

**Shipped:**
- YouTube, YouTube Music and spotify-api use the shared `topResult` (Dice similarity), like the Lavalink Spotify mode. `spotifyApiTop` and the fixed 1 / 0.9 / 0.8 scores are gone.
- The fallback first track carries its own best rating instead of 0.
- `v5-feature-inventory.md` notes where v7 differs.

**Validated:**
- Shared and backend tests went red first: 0 where a real rating was expected, and 0.9 where < 0.2 was expected in three modes.
- Then green: shared 107, backend search 12, catalog and library e2e 9/9.
- Realistic queries:
  - `yoasobi` → 100% artist
  - `kenshi yonezu lemon` → 94% track
  - nonsense → 0%
- code-review on both axes. Applied: one `topResult` call, `firstRating`, a test that pins down the best candidate, and doc notes.

**Note:** a YouTube channel is the top result only if its name is close to the query (an exact match, or ≥ 0.6 and within 0.1 of the best). The old rule was "name contains the query".

---

## #161 #162 Full-system test: a chart refetch loop and a flaky e2e (2026-11-09, branch `fix/161-chart-loop`)

**Goal:** the developer asked for every case to be tested before real use. A full run (verify, e2e, `LAVALINK_REAL=1`), then the Dashboard on the real stack in the developer's browser.

**Found:**
- **#161:** with the Apple chart down (`/api/charts/th` → 503), the idle guild page fetched the chart in a tight loop: 212 requests in about 5 s from one tab. The tab froze, and the `/api` rate limit ran out. Other calls then failed: "โหลดสถานะเพลงไม่ได้" and "บอทไม่ตอบ ลองอีกครั้ง". Cause: the effect depended on `charts`, and storing `"unavailable"` (which is never kept) re-ran it.
- **#162:** in a full e2e run, `control.spec.ts` read `commands.at(-1)` as soon as the optimistic button flipped, before the command arrived. The late pause then broke the next test.

**Shipped:**
- `components/charts/index.tsx`: the fetch effect depends on `region` only, with a reasoned `biome-ignore` like `controls/index.tsx`.
- `control.spec.ts`: `expect.poll` for the command, and a `beforeEach` that resets `commands` and `answer`.

**Validated:**
- `charts.spec.ts`: a down chart is asked once while the tab stays open, and once more after switching back. It was red first (196 requests against 1), then green.
- `control.spec.ts`: 3/3.
- Full gate on merge.

**Lesson:** an e2e that checks only the message of a failure path cannot see a refetch loop. Count the requests. Also: a live Bot answers e2e commands too (not just backend tests), and leaves `player:*` keys and a Queue Snapshot for the fake guild. Stop it before any test run.

---

## #159 An owner's Dashboard play uses their voice channel (2026-11-09, branch `fix/159-owner-voice`)

**Goal:** the developer's first real use failed. As the owner of "Space", in a voice channel there, with no Player in the guild, pressing play from the Dashboard showed "ทำไม่สำเร็จ ลองอีกครั้ง".

**Found on the command bus:**
- Each play reached the Bot with `voiceChannelId: null`, and the Bot answered `voice-channel-required`.
- `user.gateway.ts` kept an owner's own `voiceChannelId` (spec #86), but sent null when the owner named none.
- `ERROR_TH` had no text for `voice-channel-required`.

**Shipped:**
- An owner who names no channel now starts the Bot in the channel they are in (`command.voiceChannelId ?? permission.userVoice`).
- A Thai text for `voice-channel-required`.

**Validated:**
- `control.e2e.test.ts`: the owner in voice, no Player, and the relayed play names the owner's channel. Picking another channel still works.
- The test was confirmed red with the source fix stashed, and green with it.

**Lesson:** Redis pub/sub is shared across DB numbers. A live Bot on the same Redis answers the backend tests' commands, so moving the tests to DB 3 does not isolate them. Stop the live Bot before running `verify`.

---

## #157 Spotify and SoundCloud say "coming soon" (2026-11-09, branch `feat/157-coming-soon`)

**Goal:** the developer asked that Spotify (no API credentials yet) and SoundCloud (#156) say they are coming soon instead of failing silently.

**Shipped:**
- `packages/shared/src/sources.ts`: `SourcesSchema` and `SOUNDCLOUD_PLAYABLE = false` (#156).
- `GET /api/sources` reports `spotify` from whether the Spotify credentials are set. Adding them turns Spotify on with no code change.
- **Bot:** a new reason `coming-soon`, used for SoundCloud links and for Spotify playlist, album and artist links while the node has no `spotify` source. The slash reply, the autocomplete and the console all say "จะรองรับเร็ว ๆ นี้". A Spotify track link keeps its oEmbed fallback (spec #70).
- **Dashboard:**
  - The Spotify tabs are disabled and labelled "เร็ว ๆ นี้", and search opens on YouTube Music.
  - Pasted SoundCloud links and Spotify playlist links say they are coming soon.
  - The import dialog says so and refuses a Spotify link.
- `.env.example`: Spotify needs both the Backend credentials and `LAVASRC_SPOTIFY_*`.

**Validated:**
- Bot `query.test.ts` and `autocomplete.test.ts`, and the shared `sources.test.ts`, all written red first.
- Backend `catalog.e2e.test.ts`: without credentials `spotify` is false; with fake credentials it is true.
- Playwright: catalog and import with `/api/sources` answering "not ready". Both tabs are disabled, YouTube Music is the default, and links show the notes. These e2e tests were written before the code but not run red first.
- `bun run verify` exit 0, and `bun run e2e` passed 51/51 before the review fixes.

---

## #154 YouTube playback on a real Bot (2026-11-09, branch `fix/154-youtube-playback`)

**Goal:** the first real playback test, with the Bot in a Discord voice channel (Bot Test → ทั่วไป).

**Found:** the voice path works: a direct mp3 played. YouTube did not play at all. Every youtube-plugin client was refused on 1.18.1 and 1.18.2 (the latest release), with and without OAuth or a remote cipher. The issue body has the full table.

**Shipped:**
- youtube-plugin pinned to snapshot `2be8e542d3f6f178e048dca565892684c2e40177`. It includes commit `b33460b`, the TV client User-Agent fix for "The page needs to be reloaded" (youtube-source #226), which no release has yet.
- A `yt-cipher` service: third-party, pinned by digest, bound to 127.0.0.1, sharing `YT_CIPHER_TOKEN` with Lavalink. Lavalink's `remoteCipher` points at it.
- Clients: `MUSIC`, `TV`, `WEB` and `ANDROID_VR`.

**Measured:**
- Snapshot + cipher plays.
- The snapshot without the cipher fails with "Must find sig function".
- OAuth is not needed. It was tried with a spare account and then removed.

**Validated on the real Bot (Narze#5748):**
- "YOASOBI Idol" plays from YouTube. The position advanced 72.5 → 77.6 s over 5 s, and the player was connected to voice (ping 35 ms).
- A YouTube URL was queued.
- The opt-in real-Lavalink search test passes 2/2.

**Follow-up:** move back to a released youtube-plugin once one includes `b33460b`. SoundCloud in Lavalink 4.2.2 also fails, even to search (not addressed).

---

## #152 Dashboard reads the root .env (2026-11-09, branch `fix/152-dashboard-root-env`)

**Goal:** `bun run build` works from any folder. Before this, `next build` read env files only from `apps/dashboard`, so it inlined an empty Supabase URL and key, and sign-in broke. Found while testing every system before the first real use.

**Shipped:** `apps/dashboard/next.config.ts` loads the root `.env` with `process.loadEnvFile`. That call never overrides a variable already set (measured), and it is skipped when the file does not exist. `@next/env` `loadEnvConfig` could not do this: it returns its first, cached result, and Next has already called it for `apps/dashboard`.

**Validated:**
- The configured Supabase host appears in the built chunks: 3 after a root `bun run build`, and 3 after `bun run build` in `apps/dashboard`. It was 0 before the fix.
- `bun run e2e` passes 49/49. e2e's build baked the local URL (3 chunks) and no cloud URL, so the caller's values still win.
- `bun run verify` exit 0.

**Also this session:** every system was checked against the real config:
- Lavalink: connect and search.
- Supabase cloud: tables, RLS and the Discord provider.
- Backend: auth, charts and CORS.
- The Bot as Narze#5748: Redis, Lavalink, 18 commands registered, 13 guilds.
- Dashboard sign-in: reaches Discord's authorize page with the cloud redirect.

Left for the developer: completing the Discord login, and playing in a voice channel (#121).

---

## #150 Real Lavalink: empty password (2026-11-09, branch `fix/150-lavalink-password`)

**Goal:** the first run against the real Lavalink (4.2.2, compose `--profile audio`).

**Found:**
- The Bot read `env.LAVALINK_PASSWORD ?? "youshallnotpass"`. The `LAVALINK_PASSWORD=` that `.env.example` ships therefore reached Lavalink as an empty password, and `new LavalinkManager` threw `SyntaxError` on start (measured).
- The Backend switched search off whenever the variable was empty.
- Compose uses `${LAVALINK_PASSWORD:-youshallnotpass}`, so Lavalink itself ran fine with the default.

**Shipped:**
- `packages/shared/src/lavalink-node.ts` `lavalinkNode(env)` takes compose's defaults for unset or empty values. The Bot and the Backend both read the node through it.
- `.env.example` now says that an empty `LAVALINK_PASSWORD` means the compose default.

**Validated:**
- `lavalink-node.test.ts`, written red first.
- `apps/bot/test/lavalink.real.test.ts` (opt-in, `LAVALINK_REAL=1`), run with an empty password:
  - the Bot's own manager connects and gets a session;
  - `ytsearch` and `ytmsearch` find tracks;
  - a YouTube URL loads a single track.
- `bun run verify` exit 0.
- `spsearch` returns nothing while LavaSrc Spotify is off, as expected.

---

## #133 Admin follow-ups (2026-11-09, branch `fix/133-admin-followups`)

**Goal:** the agent-fixable items from the #110 reviews (#133).

**Shipped:**
- **Item 2: the Bot reconnects to Redis.**
  - **Before:** after Runtime Mode detection the client kept `retryStrategy: () => null`, so a Redis restart stopped the log ring, stats, heartbeat and Player State until the Bot restarted.
  - **Now:** it backs off from 200 ms to 5 s and keeps trying. Every subscriber connection (`subscriberOf`) inherits that and resubscribes.
  - **Found by scrutinize:** an uncaught heartbeat publish would have crashed the Bot on a real outage (an unhandled rejection exits Bun). Each beat now catches its own failure.
- **Item 4:** with `NARZE_DEVELOPER_IDS` empty, demoting or removing the last whitelisted Developer is refused (409). The page says why.
- **Item 5:** a Playwright test that an Admin who is not a Developer is sent away from `/admin/settings`. The behaviour already existed, so this test went green on its first run rather than red first.
- **Item 1:** no change. The overview already labels its caches "Cache ของบอท".
- **Item 3:** covered by #145 (sockets renew their token at `exp`).
- **Item 6:** fixed earlier, in #111.

**Not done (noted):**
- Pub/sub events sent while Redis is down are lost, so the Bot's settings copy can stay stale until the next change.
- Item 7: multi-instance revoke. ADR-0005 assumes one Backend.

**Validated:** `runtime-mode.test.ts` (a dropped client and subscriber come back and hear a publish), `heartbeat.contract.test.ts` (a failed publish leaves no unhandled rejection), the `admin.e2e.test.ts` last-Developer test, and the `admin.spec.ts` redirect and 409 message. The unit and contract tests were written red first. verify and e2e are run by the merge gate.

---

## #147 Register slash commands (2026-11-09, branch `fix/register-slash-commands`)

**Goal:** the Bot handled slash commands but never registered them with Discord, so no `/play` appeared on a real application. Every test so far ran against the fake Discord. Found while preparing the first real run (#121).

**Shipped:** `apps/bot/src/commands/register.ts` `registerCommands` sends every command's JSON in one global `commands.set` on `clientReady`, as v5 did. A failure is logged and the Bot keeps running.

**Validated:** `apps/bot/test/register.test.ts`, written red first: every command is sent by name, in one call, as plain JSON. `bun run verify` exit 0 (bot 225). **Not yet validated against Discord:** that needs the developer's first real run (#121).

**Also this session:** the narze Supabase cloud project was migrated to v7. The pre-v7 tables were empty; they were dropped, the old migration history was marked reverted, and `supabase db push --remote` was run. The developer ran the destructive steps.

---

## #142 Rate limiting (2026-11-09, branch `fix/142-rate-limit`) — items 2 and 4 open

**Goal:** #142 item 3. Every REST call and every handshake costs a Supabase Auth round trip, and one playlist preview can read up to 50 Spotify pages.

**Shipped:**
- **`RateLimiter`** (`apps/backend/src/rate-limit.ts`): an in-process fixed window per key. It sweeps ended windows once per window length.
- **Where it applies:**
  - REST calls per client address: 3000 a minute. Past that, 429 with `Retry-After`.
  - Socket handshakes per address: 500 a minute. Past that, `connect_error` `rate-limited`, before `getUser` runs. The Dashboard retries after 10 s.
  - Playlist import per user: 10 a minute.
- **Defaults:** about five times the busiest key in a full e2e run. Measured with a temporary counter, later removed: 562 REST calls and 90 handshakes in a minute from one address.
- **Client address:** the last `X-Forwarded-For` entry, believed only from this machine or from an address in `TRUSTED_PROXIES` (`.env.example`; cloudflared in Docker needs its container IP there).
- **CORS before the limiter:** the Dashboard can read a 429, and preflights are not counted.

**Review found:** the CORS order (a 429 read as a network error), the Docker-proxy case, the refused-handshake retry, and that malformed imports were counted. All fixed. Left as a documented caveat in ADR-0005: keys are whole IPv6 addresses (not /64).

**Validated:** `rate-limit.test.ts` (limiter and address rules) and `rate-limit.e2e.test.ts` (429 with `Retry-After`, CORS on a 429, uncounted preflights, the handshake refused before the token check, import limited per user), all written red first. `bun run verify` exit 0 (backend 113); `bun run e2e` 48/48.

---

## #142 Socket token expiry and function search_path (2026-11-08, branch `fix/142-socket-expiry`) — items 2–4 open

**Goal:** close the two agent-fixable LOW findings from the #114 security review (#142 items 1 and 5).

**Shipped:**
- **A socket no longer outlives its token** (`apps/backend/src/realtime/user.gateway.ts`, `expireAt` / `renew`):
  - At the handshake token's `exp`, the Backend asks the tab for its current token (`session:token`, with an ack).
  - A valid token for the same user sets the next check. No answer within 5 s, a refused token, or another user's token closes the socket.
  - The Dashboard answers from the token supabase-js keeps refreshed (`apps/dashboard/src/lib/socket.ts`).
  - Asking first, instead of closing at once, keeps the hourly reconnect from flashing the Bot as offline (`use-bot-status` treats a server disconnect as offline).
  - A token with no `exp`, or a renewed one that is already past it, is refused (fail closed).
  - A hidden tab does not refresh its token, so its socket can be closed and its reconnect refused, and socket.io does not retry a refused handshake. When a refreshed token for the same user arrives, `setSocketUser` reconnects a socket that is down. Found by scrutinize.
- **`search_path = ''`** on `replace_playlist_tracks`, `record_play` and `admin_user_stats` (migration `20261108120000`). Checked in `pg_proc`.

**#140 (player JS) parked, not shipped:**
- Lazy schemas measured 396.9 KB against 392.8 KB, because the player page parses answers at load, so zod still arrives before the track shows. Reverted.
- React, Next, supabase-js and the canvases add up to 278 KB on their own. Reaching 180 KB needs a product decision, written on #140 (`ready-for-human`).

**Open on #142:**
- Item 2: Lavalink `http` source and egress filtering (deployment).
- Item 3: rate limiting.
- Item 4: Redis `requirepass` in production.

**Validated:** `user.gateway.test.ts` covers renewal, each way a renewal can fail, and the timer cleared on disconnect. The tests were written red first. `bun run verify` exit 0 (backend 106, bot 224); `bun run e2e` 48/48. ADR-0005 now says sockets are re-checked at the token's `exp`.

---

## #114 Hardening (2026-11-08, branch `chore/114-hardening`) — AC4 blocked by #116

**Goal:** measure, then fix or file: performance, accessibility, security (#114).

**Shipped:**
- **`docs/reports/2026-11-08-hardening.md`:** every number with its device, browser, build, network and cache state.
- **Accessibility, in the gate (`e2e/a11y.spec.ts`):**
  - **axe:** 0 violations on 20 routes with seeded content plus the signed-out landing page, in light and dark.
  - **Overflow:** none at 390, 1024 and 1440 px, light and dark.
  - **Motion and WebGL:** reduced motion, `?fx=0` and no WebGL each draw the flat wash with no page errors.
  - **Keyboard only:** Tab reaches the pause toggle and a queue row's "play now"; Space and Enter reach the Bot.
- **Fixes the audits found:**
  - **Contrast:** inactive side-menu items; primary buttons are now ink-filled and 44 px (white on the dark accent was 2.6:1); `--ink-3` text moves to `--ink-2`; success text in light `--ok` is darkened; badges; mentions.
  - **SwipeRow drawer:** text was white on the dark theme's red. It now gets the theme's hex.
  - **Progress bar:** it had the seek slider nested inside it; a seekable track now exposes only the slider.
  - **Player page at 1024 px:** two grids with an implicit column made it 10 px too wide.
- **Security (whole system):**
  - **Fixed:** the admin audit lines were dropped by the Backend's log level; they are now written as warnings.
  - **Filed:** #141 (MEDIUM: owner and membership from the sign-in snapshot), #142 (LOW: sockets after sign-out, Lavalink SSRF, rate limits, Redis and Supabase exposure in production).
  - **Local binding:** Redis and Lavalink now publish on 127.0.0.1 only.
- **Test isolation:** Bot tests use Redis database 2. The Bot and Backend test runs used to race on the Bot guild set in parallel.

**Validated:**
- `bun run verify` exit 0 (shared 102, bot 223, backend 97).
- `bun run e2e` 48 passed and 3 skipped (the opt-in `PERF=1` runs), with Redis recreated on 127.0.0.1.
- **Performance, 3 runs** (`PERF=1`):
  - **LCP:** 208–260 ms unthrottled and 680–884 ms with 4× CPU and a throttled network (warm cache).
  - **INP:** 56–72 ms and 128–152 ms.
  - **CLS:** 0.002.
  - **Player JS:** **392.8 KB gzip** signed in with a cold cache, over the 180 KB target. That is #140.

**Not done:**
- AC4 (e2e as a required check) is blocked by #116.
- A screen-reader pass needs a person.
- The th/en matrix does not apply yet: there is no English locale.
- The player JS target is not met (#140).

---

## #113 Voice Commands (2026-11-08, branch `feat/113-voice-commands`) — AC5 pending

**Goal:** say a player command on the Dashboard; voice is never the only path (#113).

**Shipped:**
- **Intent grammar** (`packages/shared/src/voice-intent.ts`): an utterance maps to the same PlayerActions the buttons send (play, skip, previous, pause, resume, volume, loop modes, shuffle), in Thai and English. Numbers can be digits, Thai digits, Thai words or English words. It also handles real recognizer output: spaces between Thai words, punctuation, percent, polite particles. Voice volume stops at 100, like the slider.
- **Dashboard:**
  - **VoicePill:** supplied, vendored, coloured from tokens, with no waveform of its own. It sits in the top bar on guild pages.
  - **Speech:** the Web Speech API, th-TH first, en-US if there is no Thai model.
  - **The sheet:** it shows Strands while listening (the flat wash without WebGL), the live words, "sending", then either done or Control Permission's reason. It takes focus, and Escape closes it.
  - **One animated canvas:** the Aurora pauses while the sheet is open.
  - **Unsupported browsers:** they say so and keep every button.
  - **Cancel:** a cancel (slide, Escape, blur, close) aborts, so nothing is sent.

**Validated:**
- `bun run verify` exit 0 (shared 102, bot 223, backend 97 pass); `test/voice-intent.test.ts` 8/8, written red first.
- `bun run e2e` 40/40, including `e2e/voice.spec.ts` 3/3 with a fake recognizer:
  - the unsupported browser, with no page errors;
  - a refusal explained;
  - an allowed volume command reaching the Bot;
  - an unknown phrase;
  - the Aurora pausing and resuming;
  - closing mid-sentence sends nothing (red first).
- Screenshots at desktop width and 390 px.
- **Not done: AC5**, a manual check in Chrome with Thai speech. It needs a person with a microphone, so #113 stays open for it.

---

## #112 Operator console (2026-11-08, branch `feat/112-operator-console`)

**Goal:** run the Bot from its own terminal, quietly (spec #119).

**Shipped:**
- **Console** (`apps/bot/src/console/`): `play`, `stop`, `skip`, `leave`, `status`, `list`/`guilds`, `find guild|voice|text`, `help`, `clear`, `exit`. Arguments are quoted like a shell (`play "yoasobi idol" Lounge "Music Room"`) instead of v5's digit guess. Guilds and channels go by ID or name; a name must match exactly one. The first text channel the Bot can post in is used when none is named. `exit` closes only the console; Ctrl+C runs the normal shutdown, which closes the console first; without a terminal on stdin the console stays off. It needs only Discord and Lavalink, so it works in both Runtime Modes.
- **Silent mode:** a console `play` marks the Player silent (`narze.silent`) once a track is actually added. The Player then posts nothing to Discord for the rest of its session, including a later Discord `/play` (v5's rule) and after a restart (the Queue Snapshot keeps `silent`, so no recovery notice is posted). The old per-track `terminal` flag is gone.
- **Guards:** a Bot already in another room of that server stays there (ADR-0008), Lavalink not ready gets a message, unavailable guilds are skipped, and console replies go to stdout instead of the admin log ring.

**Validated:**
- `bun run verify` exit 0 (shared 94, bot 223, backend 97 pass).
- `test/console.test.ts`: every command and argument form (AC1), resolution by ID, exact name and unique partial name, the auto text channel, the other-room guard, Lavalink not ready, the Bot not logged in, and the prompt with a fake terminal (that test caught a crash after `exit`).
- `test/music.contract.test.ts` on Fake Lavalink (AC2): a silent session, a silent playlist, silence after a restart, and a failed console play that leaves a Discord session announcing. These were seen failing first.
- `bun run e2e` 37/37.
- Not checked: the console in a running Bot. Starting it would load the real `.env` and Discord token. Ctrl+C restoring the terminal under Bun was not checked by hand (#137).

**Not done (#137):** decide whether a console play may silence a Discord session, the Ctrl+C check by hand, `reconnect`, a paged `list`, and redrawing the prompt after log lines.

---

## #111 Admin II — guilds, channel viewer, users, sessions, restart/shutdown (2026-11-08, branch `feat/111-admin-ii`)

**Goal:** an admin reads what the Bot sees in Discord, who uses Narze, and can restart or stop the Bot, behind the #110 guard (spec #51, #110–#112, #114, #118).

**Shipped:**
- **Admin Query bus:** the Backend asks the Bot over Redis (`bot:admin-queries` / `bot:admin-results`, answered by id) for guilds, one guild, readable channels and the last 50 messages, plus restart (exit 75) and shutdown (exit 0). Only the Bot holds the Discord token (ADR-0003). The Backend reuses guild answers for 10 s, channel lists for 60 s and messages for 30 s, with one read per key at a time. Bot errors map to 404 / 403 / 502; a Bot still logging in answers not-ready.
- **Backend:** `/api/admin` guilds, guild, channels, messages, guild sessions and history, users (`admin_user_stats(p_discord_id)`: Play History plus Dashboard users, names from the latest session when needed), one user with up to 500 history items and 500 sessions, any session, `POST bot/restart|shutdown` with a confirm body. Who read which channel and who asked for a restart is logged. Presence changes reach admins live.
- **Bot:** `toMessages()` turns discord.js messages into the shared shape (every attachment and embed kind, mentions, role colours, reactions, replies, threads; pictures through Discord's media proxy). `bun run start:supervised` restarts the Bot only after a Dashboard restart. Shutdown has a 10 s deadline.
- **Dashboard:** `/admin/guilds` (search, sort, totals, open as a user), `/admin/guilds/[id]` with overview, channels, sessions and history tabs in the URL, a read-only channel viewer (a Discord markdown parser that outputs plain text nodes and links only http(s), a lightbox, YouTube-only embed frames), `/admin/users` with live "on Dashboard" dots and Active Today, user detail, session detail, and restart/shutdown behind dialogs. Dates are th-TH.
- **Sessions page (#108) fix:** live sessions that arrive while the list loads are kept, and the list reloads after a reconnect. This was the `sessions.spec.ts:104` failure.

**Validated:**
- `bun run verify` exit 0 (shared 94, bot 207, backend 97 pass).
- Backend `admin-ii.e2e.test.ts` 8/8 with a fake Bot: guild list and playing flags, messages read once for two parallel and one later request, 504 when the Bot is silent, restart/shutdown confirm and who asked, users with presence and Active Today, user detail with profile, any session, guild sessions and history, live presence pushes. These tests were seen failing first.
- Bot `admin-queries.test.ts`: fixtures of every attachment and embed kind, mentions, replies, threads, media proxy, restart/shutdown exit codes, the real bus over Redis with a stub client, and the supervisor's decision.
- `bun run e2e` 37/37 in two full runs, including `e2e/admin-ii.spec.ts`: open a guild, read a channel (markdown, mentions, reply, every attachment and embed kind, reaction, thread, lightbox, URL state after reload), view a user.
- A crafted 4000-character message parses in about 1 ms (the review measured about 1.1 s before the fix).

**Not done (#135):** one shared Redis request/response transport with the #101 command bus, the guild icon on session detail, mentions inside embeds, the full v5 guild overview, negative caching and late answers, multi-Backend presence, a deploy note for the supervisor.

---

## #110 Admin I — whitelist, stats, live log (2026-11-08, branch `feat/110-admin-i`)

**Goal:** an admin area the Backend enforces, with the Bot's stats and live console (spec #74, #97, #109, #113, #120, #122).

**Shipped:**
- **Roles:** `admin_whitelist` (RLS, service role only) plus `NARZE_DEVELOPER_IDS`, which are always Developers and the only way in on a fresh database. One `AdminGuard` on every `/api/admin` route; `@DeveloperOnly` for the whitelist; a fixed Developer answers 409.
- **Bot:** `captureConsole` copies every console line (cut at 8 KB) into a 1000-line Redis ring and publishes it; a stats sample every 5 s (CPU over its window, process uptime and RSS, guilds, active players, cache sizes) goes to a 60-sample ring. One `createRingSink` writes both, batching lines that arrive during a write.
- **Backend:** `AdminGateway` with two rooms, `admin:stats` and `admin:logs`. Joining verifies the tab's current token and the role, re-checks the role after joining, and sends the last 100 lines. Removing someone from the whitelist takes their open tabs out of both rooms.
- **Dashboard:** `/admin` overview (cards, SloshGauge CPU and memory, CPU and memory trends, caches, a stale sample shown as such), `/admin/logs` terminal (level filter, search, pause with a live waiting count, follow, clear, download, ANSI colours on a `.deep` island), `/admin/settings` whitelist for Developers. "แอดมิน" appears in the nav for admins only.
- **Test infra:** fake Discord builds the email from the user id, so two test users with one username are never linked into one Supabase account.

**Validated:**
- `bun run verify` exit 0 (shared 89, bot 202, backend 89 pass).
- Backend `admin.e2e.test.ts` 7/7: every registered admin route 403/401 (read from the router, not a list), the Developer-only whitelist, history then live, stats-only tabs, removal and unsubscribe leave the rooms, a missing or foreign token is refused. The removal, token and unsubscribe tests went red first.
- `bun run e2e` 36/36, including `e2e/admin.spec.ts` 3/3. One earlier full run failed `sessions.spec.ts:104` once (2 s timeout); it passed alone and in the next full run (#133 item 6).

**Not done (#133):** Backend caches in the stats and cache flush on shutdown, the Bot's Redis reconnect, a token that expires while an admin socket is open, a Developer locking themselves out, the Settings redirect in Playwright.

---

## #109 Charts on the idle guild page (2026-11-08, branch `feat/109-charts`)

**Goal:** a real chart to start from when nothing plays, honest when its source is down (spec #53, #72, #117).

**Shipped:**
- **Provider (ADR-0010):** Apple Music's public RSS "Top Songs" for Thailand and the US, verified live before any code (the request is on #109). v5's RapidAPI Billboard was suspended.
- **Shared:** `ChartSchema`, `rankMovement()` (against the previous update, by `trackKey`), `CHART_SHOWN`, `RedisKeys.chart()`.
- **Backend:** `ChartService` and `GET /api/charts/:region`.
  - It refreshes every 3 days, through an hourly check and on any due read.
  - After a failure it serves the last copy marked stale; with no copy, 503. A 15-minute backoff follows a failure.
  - The 10 songs shown get Spotify enrichment, kept only for a same-title match.
- **Dashboard:** `ChartPanel` on the idle guild page.
  - Thailand and US tabs, top 10, rank movement and artwork.
  - A song plays on click, by its Spotify link when matched.
  - A stale copy shows its date, and the panel says when the chart cannot load.
- **e2e:** runs on Redis database 1, so nothing an e2e run writes reaches a dev Backend.

**Validated:**
- `bun run verify` exit 0; backend charts 7/7, shared charts 4/4.
- `bun run e2e` 33/33, including `e2e/charts.spec.ts` 2/2:
  - the chart renders and a song plays;
  - the US chart, which is down, says so;
  - a stale copy shows its date.
- Red first: the features and the review fixes (backoff, match rule, rank positions, duplicate songs).
- Screenshots at 1280 and 390 px.

**Not done here:** shared Row CSS with top-played (#128). Real Apple, Spotify and Discord are untested end to end (#121).

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
- `bun run verify` exit 0: bot 198 (incl. the recorder, history, store contract and music hooks), backend history e2e 5/5 (AC2: a Guild member who was not a participant gets no event and a 404), shared `trackKey` (AC3).
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
