# Architecture Decision Records

Each ADR captures one significant, hard-to-reverse decision: its context, what was chosen,
the alternatives rejected, and the consequences. They document decisions **already in the
codebase** (unless marked *pending*), so a new maintainer — human or agent — can recover the
*why* without re-deriving it. A decision that overturns an earlier one marks the old ADR **Superseded**.

> 0001–0003 were written during v6 and carried into `v7` as-is. Their paths (`discordjs/`, `nestjs/`)
> name the v6 layout; in v7 the same roles are `apps/bot` / `apps/api`. The decisions stand until a
> new ADR supersedes one — **impl pending** in v7 because no v7 code exists yet.

| # | Title | Area | Status |
|---|-------|------|--------|
| [0001](0001-socketio-over-sse.md) | Socket.io instead of SSE for real-time communication | api · web | Accepted — **impl pending** (v7) |
| [0002](0002-redis-ipc-bot-backend.md) | Redis Pub/Sub as IPC between Bot and Backend | bot · api · infra | Accepted — **impl pending** (v7) |
| [0003](0003-bot-two-mode-architecture.md) | Bot two-mode architecture (Connected / Standalone) | bot | Accepted — **impl pending** (v7) |

## Conventions

- Filename: `NNNN-kebab-title.md`, zero-padded. **Numbers must be unique** across *all* branches
  (v6 and v7 share this numbering — check both before picking the next number).
- Body: title line, a status/context block, then `## Context`, `## Decision`,
  `## Alternatives considered`, `## Consequences`.
- Ground every claim in the code as it is **now**; cite `file:line`.
- One decision = one ADR. Overturning a decision means a **new** ADR that marks the old one
  **Superseded by NNNN** — never edit the old one's decision.
- Skeleton: `t4-engineering-records` skill → `references/record-templates.md`.
