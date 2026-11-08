# #114 hardening — measured performance, accessibility, security

Measured on branch `chore/114-hardening` from `v7` at `ed0770fe` (2026-11-08). Every number below
comes from a run in this session. The command that produces it is written next to it.

## Conditions

| | |
|---|---|
| Device | Intel Core i5-13500 (20 threads), 48 GB RAM, Windows 11 (10.0.26300) |
| Browser | Chromium bundled with Playwright 1.65.0, headless, viewport 1280×720 unless stated |
| Build | Next.js 16.4.5 production build (`next build` + `next start`, React 19.3.1), started by Playwright's web server |
| Network | localhost: Backend, Supabase local and Redis on this machine. Throttled run: a custom network profile through the DevTools protocol (40 ms latency, 9 Mb/s down, 1.5 Mb/s up; not DevTools' Fast 4G preset) and 4× CPU slowdown |
| Data | A Player in a guild with one track playing (`e2e/perf.spec.ts` seeds Redis) |

## Player route performance (AC1)

`PERF=1 bun run e2e -- e2e/perf.spec.ts`, three runs after the review fixes.
- **LCP and CLS:** from `PerformanceObserver`.
- **INP:** the longest event duration over two real clicks, the pause toggle and the side panel's Search tab.
- **Warm cache:** LCP and INP are measured after sign-in in the same context, so the JS is already cached. The network throttle therefore mostly hits the HTML and the API calls.

| Measure | Target | Unthrottled, warm cache (3 runs) | 4× CPU + throttled network, warm cache (3 runs) | Status |
|---|---|---|---|---|
| LCP | < 2.5 s | 208 / 256 / 260 ms | 680 / 704 / 884 ms | ✅ |
| INP (scripted, 2 clicks) | < 200 ms | 56 / 56 / 72 ms | 128 / 136 / 152 ms | ✅, within 50 ms of the target when throttled |
| CLS | < 0.05 | 0.002 / 0.002 / 0.002 | 0.002 / 0.002 / 0.002 | ✅ (every shift summed, which can only overstate) |
| Player JS, gzip as sent | < 180 KB | **392.8 KB**: signed in, cold cache (`Network.clearBrowserCache`), 18 files, every `/_next/*.js` until the network is idle | — | ❌ over target |

**Player JS is over target, by more than twice.** An earlier signed-out measurement (201.1 KB) missed the chunks only a signed-in player page loads. Largest files, gzip:
- about 70 + 43 KB: React DOM and the Next runtime;
- 62 KB: supabase-js (sign-in and session);
- 52 + 50 KB: two motion and animation chunks (the supplied canvases and components);
- 35 KB: zod, through `@narze/shared`;
- 15 KB: BranchedMenu.

The count includes chunks that load lazily before the network goes idle, so it slightly overstates "initial". The fix is a bundle-splitting job across packages: lazy auth, lazy canvases, and a smaller zod on the client. That is #140 (severity: medium, performance).

## Accessibility (AC2)

`bun run e2e -- e2e/a11y.spec.ts`, in the gate:

- **axe (WCAG 2.0/2.1/2.2 A and AA), light and dark: 0 violations on 20 routes with real content and on the signed-out landing page.** The data is seeded: a Player with a queue, an idle guild with its chart, a Listening Session, Play History, a playlist, a like, and admin pages answered by a fake Bot. Each route waits for its own content before axe runs. The first run, on 11 empty routes, missed several problems. The routes are:
  - `/`, `/search`, `/library`, `/library/liked`, `/library/:id`
  - `/sessions`, `/sessions/:id`
  - `/artist/:id`, `/album/:id`
  - `/guilds/:id` with a Player, `/guilds/:id` idle, `/guilds/:id/settings`
  - `/admin`, `/admin/logs`, `/admin/settings`
  - `/admin/guilds`, `/admin/guilds/:id` (with a channel open), `/admin/users`, `/admin/users/:id`, `/admin/sessions/:id`

  Fixed along the way:
  - **Side menu:** the inactive items were 55% of `--ink-2`, under 4.5:1. They now use `--ink-2`.
  - **Primary buttons:** white on `--accent` measured 2.6:1 in dark. They are now ink-filled per DESIGN.md §2 rule 2, and 44 px tall. This covers catalog, browse, library and settings.
  - **Admin role badge:** measured 3.82:1. It now uses `--ink-2`, as does the channel viewer's badge.
  - **Text in `--ink-3`:** chart rank movement, the chart source, library row numbers, queue meta, and select-server hints measured 2.71:1 (light) and 3.96:1 (dark). They now use `--ink-2`.
  - **Success text in light `--ok`:** measured 4.04:1. It is now `--ok` mixed 75% with ink.
  - **Channel viewer mentions:** accent text on an accent tint. Now accent 80% mixed with ink.
  - **Nested control on the player:** the progress bar was a `progressbar` with the seek slider inside it. A seekable track now exposes only the slider, which follows playback (`aria-valuetext`).
  - **Queue swipe drawer:** white text on the dark theme's red measured 2.79:1. The supplied SwipeRow picks its text from a hex colour and fell back to white for a CSS variable; it now gets the theme's hex.
  - **Queue "clear" confirm:** white on the dark theme's `--danger` would fail the same check (axe could not reach it with the dialog closed). It now uses paper text.
- **No horizontal overflow** on every route above at 390, 1024 and 1440 px, in light and dark (120 page loads, each waiting for its content). The player page was 10px too wide at 1024 px: the side panel and the queue were grids with an implicit column sized to their content. Both now have `grid-template-columns: minmax(0, 1fr)`. The check reads the document's scroll width. It cannot see content clipped inside `overflow: hidden` boxes, and long titles were not tested.
- **Reduced motion, `?fx=0`, and no WebGL** (three separate cases, the last with `getContext('webgl2')` returning null): the player page renders with its queue, draws the flat wash instead of the Aurora, and throws no page errors.
- **Keyboard only:**
  - Tab reaches the pause toggle and a queue row's "play now".
  - Both show a focus ring.
  - Space and Enter send `pause` and `playNow` to the Bot.
- **Not done here:**
  - A screen-reader pass (NVDA or VoiceOver) needs a person.
  - The th/en part of the issue's language matrix does not apply yet: the Dashboard has no English locale.

## Security review (AC3)

A whole-system review (not a diff) of authentication, Control Permission, the admin boundary, RLS and functions, Redis IPC, Dashboard XSS sinks, and the Bot. The full findings are in #141 and #142.

| Severity | Finding | Status |
|---|---|---|
| MEDIUM | Server ownership and membership come from the sign-in snapshot (`user_guilds.is_owner`), so a former owner keeps owner rights and a kicked member keeps reads until they sign in again | Filed: #141 |
| LOW | The admin audit lines (channel reads, restart/shutdown) used `logger.log`, which the Backend's logger levels drop | **Fixed here:** written as `warn` with an `audit:` prefix |
| LOW | Sockets are verified only at the handshake: after sign-out an open tab keeps receiving guild events (and an admin, the live log) | Filed: #142 |
| LOW | Lavalink's `http` source can be pointed at internal addresses through DNS or redirects | Filed: #142 (egress filtering or `http: false` in production) |
| LOW | No rate limiting; every request costs a Supabase Auth call | Filed: #142 |
| condition | Redis has no password: anyone who can publish to it bypasses every check | **Fixed for local work here** (127.0.0.1 only); production needs `requirepass`/ACLs, #142 |

Checked and found safe:
- **Identity:** it comes only from the Discord identity. The sync rejects a foreign provider token.
- **Route guards:** every REST controller requires auth or the AdminGuard.
- **Row scoping:** library and history rows are scoped to their owner or participants.
- **Supabase:** RLS is on for all 9 tables, `anon` is fully revoked, and every function is `security invoker` with EXECUTE revoked.
- **XSS:** the only `dangerouslySetInnerHTML` is a static pre-paint script. Markdown links are http(s) only. `postMessage` is pinned to the page's own origin.
- **CORS and CSRF:** CORS allows one origin, and bearer tokens mean CSRF does not apply.
- **Bot commands:** `/setchannel` checks owner or Bot Owner.

## E2E as a required check (AC4)

Blocked by #116 (GitHub Actions billing lock): no check can run, so none can be required. Until #116 is cleared, the T4 gate runs the full e2e suite locally before every merge.
