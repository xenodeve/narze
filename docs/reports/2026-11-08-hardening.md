# #114 hardening — measured performance, accessibility, security

Measured on branch `chore/114-hardening` from `v7` at `ed0770fe` (2026-11-08). Every number below
comes from a run in this session. The command that produces it is written next to it.

## Conditions

| | |
|---|---|
| Device | Intel Core i5-13500 (20 threads), 48 GB RAM, Windows 11 (10.0.26300) |
| Browser | Chromium bundled with Playwright 1.65.0, headless, viewport 1280×720 unless stated |
| Build | Next.js 16.4.5 production build (`next build` + `next start`, React 19.3.1), started by Playwright's web server |
| Network | localhost: Backend, Supabase local and Redis on this machine. Throttled run: Chrome DevTools fast 4G (40 ms latency, 9 Mb/s down, 1.5 Mb/s up) and 4× CPU slowdown |
| Data | A Player in a guild with one track playing (`e2e/perf.spec.ts` seeds Redis) |

## Player route performance (AC1)

`PERF=1 bun run e2e -- e2e/perf.spec.ts`, three runs. LCP and CLS come from `PerformanceObserver`. INP is the longest event duration over two real clicks: the pause toggle and a tab.

| Measure | Target | Unthrottled (3 runs) | 4× CPU + fast 4G (3 runs) | Status |
|---|---|---|---|---|
| LCP | < 2.5 s | 220 / 224 / 348 ms | 748 / 844 / 892 ms | ✅ |
| INP | < 200 ms | 56 / 80 / 136 ms | 96 / 120 / 152 ms | ✅, within 50 ms of the target when throttled |
| CLS | < 0.05 | 0.002 / 0.002 / 0.002 | 0.002 / 0.002 / 0.002 | ✅ |
| Initial JS, gzip as sent | < 180 KB | **201.1 KB** (10 files, cold cache) | — | ❌ over target |

Caveats:
- LCP and INP are measured after sign-in in the same browser context, so the shared chunks are already cached. The JS row uses a fresh context with a cold cache.
- INP varies between runs on this machine (56–136 ms unthrottled). The perf spec is therefore an opt-in measurement run, not part of the e2e gate.

**Initial JS is over target.** The largest files are about 70 KB (React DOM and the Next runtime), 43 KB (the app runtime), and **35 KB of zod**. zod comes in because the Dashboard imports schemas from `@narze/shared`, and any schema used pulls in the whole classic zod build (125 KB raw). Getting under 180 KB needs either the `zod/mini` build in the client-side schemas or lazy validation. That is a cross-package change, filed as #140 (severity: medium, performance).

## Accessibility (AC2)

`bun run e2e -- e2e/a11y.spec.ts`, in the gate:

- **axe (WCAG 2.0/2.1/2.2 A and AA), light and dark: 0 violations on every route.** The routes checked are `/`, `/search`, `/library`, `/sessions`, `/artist/:id`, `/album/:id`, `/guilds/:id`, `/guilds/:id/settings`, `/admin`, `/admin/logs` and `/admin/settings`. The first run found these, now fixed:
  - **Side menu:** the inactive items were 55% of `--ink-2`, under 4.5:1. They now use `--ink-2`.
  - **Primary buttons:** white on `--accent` measured 2.6:1 in dark. They are now ink-filled per DESIGN.md §2 rule 2, and 44 px tall. This covers catalog, browse, library and settings.
  - **Admin role badge:** measured 3.82:1. It now uses `--ink-2`, as does the channel viewer's badge.
  - **Queue "clear" confirm:** white on the dark theme's `--danger` would fail the same check (axe could not reach it with the dialog closed). It now uses paper text.
- **No horizontal overflow** on any route above at 390, 1024 and 1440 px, in light and dark (66 page loads).
- **Reduced motion and WebGL off** (`prefers-reduced-motion: reduce` plus `?fx=0`): the player, home and admin pages render completely with no page errors. No WebGL Aurora runs; the flat wash is drawn instead.
- **Keyboard only:**
  - Tab reaches the pause toggle and a queue row's "play now".
  - Both show a focus ring.
  - Space and Enter send `pause` and `playNow` to the Bot.
- **Not done here:**
  - A screen-reader pass (NVDA or VoiceOver) needs a person.
  - The th/en part of the issue's language matrix does not apply yet: the Dashboard has no English locale.

## Security review (AC3)

A whole-system review of the auth, permission and admin boundaries. Findings and their status are in the PR for #114 and in the issues it files. `docker-compose.yml` now publishes Redis (6379) and Lavalink (2333) on 127.0.0.1 only. Redis has no password, and anyone who can publish to it could forge Bot events (ledger row).

## E2E as a required check (AC4)

Blocked by #116 (GitHub Actions billing lock): no check can run, so none can be required. Until #116 is cleared, the T4 gate runs the full e2e suite locally before every merge.
