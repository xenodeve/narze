# Plan — Narze v7 rewrite (feature parity with v5.0.2 + approved additions)

- **Date:** 2026-11-08 · **Branch:** `v7` (from `v6`) · **Status:** LIVING — PRD #97, slices #98–#114
- **Spec (what):** `docs/research/v5-feature-inventory.md` — §11 = 123 acceptance items (referenced below as `#n`), §10 = 182 defects to fix, not copy.
- **Design (how it looks):** `DESIGN.md` (Strata-xeno) · **Why:** `PRODUCT.md` · **Words:** `CONTEXT.md`
- **Governing ADRs:** 0001 Socket.io · 0002 Redis IPC Bot↔Backend · 0003 Bot Connected/Standalone

## 1. Decisions taken (developer, 2026-11-08)

| Decision | Choice |
|---|---|
| Repo | `xenodeve/narze`, fresh rewrite on `v7`; `v6` is reference only |
| Lavalink client | `lavalink-client` (replaces `riffy`; v5's `sinsacord` was dead code) → **ADR-0004** |
| Design language | Strata-xeno, plain CSS + CSS Modules, no Tailwind |
| Charts | build working charts (verify provider first) — v5 block was hardcoded |
| Additions | Voice Commands, Bot Avatar + outfits, Likes, now-playing notifications, loop/shuffle/play-next on web |
| clink | not used |

## 2. Architecture

```
apps/dashboard  Next.js 16 (App Router, RSC, proxy.ts)  ──REST + Socket.io──▶  apps/backend  NestJS
apps/backend    auth · permission · REST reads · Socket.io rooms · Hot Cache ──Redis pub/sub──▶ apps/bot
apps/bot        discord.js 14 · lavalink-client · slash commands · Queue Snapshot · operator console
packages/shared zod schemas: Player State, events, commands, REST DTOs (single contract source)
Supabase        Postgres + Auth (Discord provider) + RLS — source of truth
Redis           pub/sub IPC · Hot Cache tier 2 · rate limits · presence (ref-counted)
```

ADRs to write before the code that depends on them:

- **ADR-0004** `lavalink-client` over `riffy`.
- **ADR-0005** Supabase Auth (Discord provider, popup flow) replaces Firebase custom tokens; Backend verifies the Supabase JWT and derives the Discord ID server-side (fixes v5 §0.3/§0.4).
- **ADR-0006** Two-tier Hot Cache (Backend in-process LRU → Redis) with per-key TTLs from spec #73; snapshots keyed by `guildId` + **Queue Revision**.
- **ADR-0007** Realtime contract: every guild event carries `{revision, sequence, ts}`; clients drop `revision < local`, refetch on a gap; `jumpToTrack` precedes the queue update (#37–#39, #101).

Performance stance (targets in `DESIGN.md` §9): RSC for read-mostly pages, one Socket.io connection per tab multiplexing guild rooms, Player progress interpolated client-side (#103) so the server never streams positions, Hot Cache answers every page load without touching the Bot.

Version pins (verify at scaffold): TypeScript 5.9.x across the repo (TS 7 + Nest decorator metadata unverified), Next 16, React 19, NestJS 12, discord.js 14, lavalink-client 2, Bun workspaces.

## 3. Slices (tracer bullets — each ends runnable and verified)

| # | Slice | Covers | Verify |
|---|---|---|---|
| S0 | Monorepo scaffold: Bun workspaces, `packages/shared` contracts, lint/typecheck/test/build, docker-compose (Redis, Lavalink 4 + youtube/lavasrc plugins), Supabase local | infra | `bun run verify` green in CI |
| S1 | Bot playback core: `/play /skip /pause /seek /volume /join /leave /queue /loop /clear /247 /ping`, Track Resolution, Now-Playing Notice + suppression flags, self-deaf join, raw voice forwarding | #1 #3–#6 #8–#11 #14–#15 #18–#20 #23–#27 #55–#56 #62–#66 #70 | bot integration tests against a Lavalink container; manual play in a test guild |
| S2 | Bot resilience: Queue Snapshot + Queue Recovery, voice-drop recovery (4006/4009/4014/4015), 24/7 Idle Player, Standalone/Connected mode, startup order | #10 #21 #27–#28 #35 #123 | kill/restart test restores queue; socket-close simulation |
| S3 | Supabase schema + RLS + migrations: guild_settings, users, admin_whitelist, playlists(+tracks), listening_sessions(+tracks, participants), play_history, likes, guild_avatar | #31 #33 #95 #116 #121–#122 | migration tests; RLS denies cross-user writes |
| S4 | Bot commands II: `/playnext /playat /playqueue /skipplay /cache /setchannel`, autocomplete + cache, guild events (owner from audit log, welcome), command audit log + promo | #2 #7 #12–#13 #17 #22 #34 #67–#69 | command unit tests; autocomplete cache hit/miss |
| S5 | Backend core: Supabase JWT auth, Control Permission ladder, admin roles, Redis IPC, Socket.io rooms, Player State Hot Cache, command relay with acting user, rate limits | #30 #36–#47 #54 #93 #98–#100 #107–#108 | e2e: two clients see same revision; unauthorised control rejected |
| S6 | Dashboard shell: tokens/fonts/theme, login popup, app shell (BranchedMenu), guild picker + server list with live badges, bot status, Bot Avatar, presence | #75–#80 #94 #96–#97 #105–#106 | Playwright: login stub, guild list live update |
| S7 | Player page: Now Playing (Aurora/mood, progress interpolation, crossfade), controls incl. loop/shuffle/play-next, volume, 24/7, queue (drag + SwipeRow + keyboard, optimistic + revision recheck), voice-channel picker, permission messaging | #81–#83 #86–#87 #101–#104 + additions | Playwright two-tab sync; reduced-motion snapshot |
| S8 | Search & catalog: 4 source modes, top-result scoring, artist/album/channel pages, quick-add, select-server modal, metadata caches with spec TTLs | #48–#49 #57–#61 #73 #85 #90–#91 | search contract tests; cache TTL tests |
| S9 | Library + Likes: playlist CRUD, import preview (Spotify/YouTube), play-all, rename/edit (v5 gap); PulseHeart + Liked playlist | #50 #71 #89 + Likes | API + Playwright import flow |
| S10 | History: Listening Sessions (write-behind ≤5 min, crash-safe), Play History aggregates, top-played, session pages, idle home | #31–#33 #84 #88 #115–#116 | restart closes sessions; participant-only delivery |
| S11 | Charts: verify a live provider, build endpoint + cache (3 d), idle-home chart block | #53 #72 #117 | provider contract test |
| S12 | Admin: stats, live logs (ring buffer, ANSI), guilds, read-only channel viewer, users + presence, sessions, whitelist (Developer), restart/shutdown, performance | #51–#52 #74 #109–#114 #118 #120 | role-gated e2e; non-admin denied server-side |
| S13 | Operator console in the Bot | #119 | console command tests |
| S14 | Voice Commands: Web Speech (`th-TH`/`en-US`), intent grammar → player actions, VoicePill + Strands sheet, unsupported-browser state | addition | intent parser unit tests; manual Chrome check |
| S15 | Guild settings + extras: Music Channel, Bot Avatar outfit editor, now-playing notifications (BellToggle) | #92 + additions | Playwright settings save + live `settingsUpdate` |
| S16 | Hardening: measured perf budgets, axe, security review, 390/1024/1440 × themes × languages | quality | Lighthouse/INP numbers recorded with conditions |

Order: S0 → S1 → S2 → S3 → S5 → S6 → S7 form the first usable product; S4 and S8–S15 parallelise after S5; S16 last.

## 4. Change inventory

Greenfield — nothing in `v7` exists to modify. Every slice creates files under its own app; shared contracts change only in `packages/shared` and every consumer is found by `rg` on the schema name. Docs touched by this plan: `CONTEXT.md`, `PRODUCT.md`, `DESIGN.md` (done), `docs/adr/0004–0007` (to write), `docs/OPEN-WORK-LEDGER.md`.

**Survey boundary:** the spec was produced by reading v5 source at `4a6faf06`; seven cache modules were never committed (§0.2) and are reconstructed from call sites, so their exact behaviour is a hypothesis to confirm in S4/S8.

## 5. Must-fix from v5 (§10 highlights)

Unauthenticated bot API and self-asserted identity; open admin endpoints and whitelist; leaked Spotify credentials (rotate); `.gitignore` swallowing a source `cache/` folder; duplicate dead routes; client never consuming `revision`; Sign Out not signing out; no OAuth `state`.

## 6. Out of scope

Discord voice-channel speech recognition; mobile apps; multi-node Lavalink failover beyond what `lavalink-client` provides.
