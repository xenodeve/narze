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
| v7 rewrite — PRD #97 (17 slices #98–#114, sub-issues of #97); plan `docs/superpowers/plans/2026-11-08-narze-v7-rewrite.md` | 🟢 | — | Start #98 (walking skeleton); order and blockers are in each issue |

## Track 2 — repo operating layer

| Item | Status | Gate | Next action |
|---|---|---|---|
| **No-CI mode** — Actions cannot start (billing lock); merges are verified locally only (#116) | 🟡 | developer fixes GitHub billing | Then re-run CI on `v7`, apply the ruleset, narrow `verify` back to the fast suite, close #116 |
| Apply the `v7` ruleset + verify security settings | 🔴 | `v7` pushed and `T4 verify` has run once | Run the commands under "Pending: apply after first push" in `docs/agents/workflow.md` |
| Thai mirror for `docs/agents/*` per the governance-doc convention (`<!-- lang:en/th -->`, full mirror) | 🔴 | — | Add the Thai side to `domain.md`, `issue-tracker.md`, `triage-labels.md`, `workflow.md` |

---

## Management Plan — phased execution order

**Phase 0 — Parity spec.** Done: `docs/research/v5-feature-inventory.md`.
**Phase 1 — Tracking.** Done: PRD #97 with 17 slice sub-issues.
**Phase 2 — Build.** #98 first (scaffold `apps/bot`, `apps/backend`, `apps/dashboard`, `packages/shared` and replace the placeholder root scripts), then #99 → #100 → #101 → #102; the rest parallelise per their Blocked-by.

**Gating summary:** #98 is the multiplier — every other slice builds on its contracts and test seams.
