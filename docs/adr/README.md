# Architecture Decision Records

Each ADR captures one significant, hard-to-reverse decision: its context, what was chosen,
the alternatives rejected, and the consequences. They document decisions **already in the
codebase** (unless marked *pending*), so a new maintainer — human or agent — can recover the
*why* without re-deriving it. A decision that overturns an earlier one marks the old ADR **Superseded**.

> 0001–0003 were written during v6 and carried into `v7` as-is. Their paths (`discordjs/`, `nestjs/`)
> name the v6 layout; in v7 the same roles are `apps/bot` / `apps/backend`. 0002 and 0003 are implemented in #98
> (Redis heartbeat, runtime-mode detection); 0001 is implemented for `bot:status` in #98.

| # | Title | Area | Status |
|---|-------|------|--------|
| [0001](0001-socketio-over-sse.md) | Socket.io instead of SSE for real-time communication | backend · dashboard | Accepted — implemented (#98, `bot:status`) |
| [0002](0002-redis-ipc-bot-backend.md) | Redis Pub/Sub as IPC between Bot and Backend | bot · backend · infra | Accepted — implemented (#98, heartbeat) |
| [0003](0003-bot-two-mode-architecture.md) | Bot two-mode architecture (Connected / Standalone) | bot | Accepted — mode detection implemented (#98) |
| [0004](0004-lavalink-client.md) | `lavalink-client` as the Bot's Lavalink client (`closeOnError: false` on Bun) | bot | Accepted (#98) |
| [0005](0005-supabase-auth-discord.md) | Supabase Auth with Discord; the Backend derives identity from a verified session | backend · dashboard · infra | Accepted — implemented (#99) |
| [0006](0006-hot-cache.md) | Two-tier Hot Cache for Player State — in-process LRU in front of Redis | bot · backend · dashboard | Accepted — Player State tier implemented (#100) |
| [0007](0007-realtime-event-contract.md) | Realtime event contract — revision, sequence, one socket per tab | shared · backend · dashboard | Accepted (#98 schemas) |

## Conventions

- Filename: `NNNN-kebab-title.md`, zero-padded. **Numbers must be unique** across *all* branches
  (v6 and v7 share this numbering — check both before picking the next number).
- Body: title line, a status/context block, then `## Context`, `## Decision`,
  `## Alternatives considered`, `## Consequences`.
- Ground every claim in the code as it is **now**; cite `file:line`.
- One decision = one ADR. Overturning a decision means a **new** ADR that marks the old one
  **Superseded by NNNN** — never edit the old one's decision.
- Skeleton: `t4-engineering-records` skill → `references/record-templates.md`.
