# Open Work Ledger — consolidated single source (2026-11-08)

> **Why this file exists:** open work scatters across GitHub issues, ADRs, plans, and DONE.md.
> Agents read issues but often miss the MD. This ledger consolidates **everything still open** —
> GitHub-tracked **and** MD-only — into one place, deduped, with a phased plan.
> **Read this file at session start (it is linked from AGENTS.md).** When you finish an item,
> update its row here AND its GitHub issue; when you discover new work, add a row here and
> (for anything non-trivial) file an issue so it doesn't vanish into MD again.

**Legend:** ✅ done, pending merge · 🟢 buildable now · 🟡 gated (needs merge / resource /
decision) · 🔴 **UNTRACKED** (MD-only, no GitHub issue — highest miss-risk)

---

## Track 1 — v7 rewrite

| Item | Status | Gate | Next action |
|---|---|---|---|
| v7 rewrite — PRD #97 (17 slices #98–#114, sub-issues of #97); plan `docs/superpowers/plans/2026-11-08-narze-v7-rewrite.md`. **#98 done** (PR #115), **#99 done** (PR #119), **#100 done** (PR #120), **#101 done** (feat/101-dashboard-control) | 🟢 | — | Next: #102 (queue management: move, skip-to, play-now, remove, clear). Manual real-playback check: #121 (needs a Discord token + test guild) |

| Local Redis in `docker-compose.yml` has no password and publishes 6379: anyone on the network can publish fake heartbeats (status display only). Bind to 127.0.0.1 or set `requirepass` before any deployment | 🟡 | #114 hardening | Fold into #114's security review |
| Backend e2e `beforeAll` once timed out at ~5.4 s on the first full-suite run; not reproduced in 7 runs (mitigated with a 30 s hook timeout) | 🟡 | recurrence | If it recurs, time `createApp` vs `listen` |

## Track 2 — repo operating layer

| Item | Status | Gate | Next action |
|---|---|---|---|
| **No-CI mode** — Actions cannot start (billing lock): a merged PR means "the author ran verify", not "CI passed"; CodeQL is unverified (#116) | 🟡 | developer fixes GitHub billing | Then re-run CI on `v7`, apply the ruleset, restore `verify`, the `workflow.md` mandate and the `pre-push` message, close #116 |
| Apply the `v7` ruleset + verify security settings | 🔴 | `v7` pushed (done) and `T4 verify` has run once — blocked by #116 | Run the commands under "Pending: apply after first push" in `docs/agents/workflow.md` |
| Thai mirror for `docs/agents/*` per the governance-doc convention (`<!-- lang:en/th -->`, full mirror) | 🔴 | — | Add the Thai side to `domain.md`, `issue-tracker.md`, `triage-labels.md`, `workflow.md` |

---

## Management Plan — phased execution order

**Phase 0 — Parity spec.** Done: `docs/research/v5-feature-inventory.md`.
**Phase 1 — Tracking.** Done: PRD #97 with 17 slice sub-issues.
**Phase 2 — Build.** #98 first (scaffold `apps/bot`, `apps/backend`, `apps/dashboard`, `packages/shared` and replace the placeholder root scripts), then #99 → #100 → #101 → #102; the rest parallelise per their Blocked-by.

**Gating summary:** #98 is the multiplier — every other slice builds on its contracts and test seams.
